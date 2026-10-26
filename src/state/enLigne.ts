import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import type { IdVariante } from '../engine/variantes'
import type { Langue } from '../types'
import { notifier, remplacer, sauvegardeVide, surModification, vider, type Sauvegarde } from './sauvegarde'

/**
 * Connexion à Supabase : le jeu se joue uniquement en ligne. Sans VITE_SUPABASE_URL
 * et VITE_SUPABASE_PUBLISHABLE_KEY, il affiche un message de configuration manquante.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const cle = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabase: SupabaseClient | null = url && cle ? createClient(url, cle) : null

const PRIS_EN_CHARGE = ['discord', 'google', 'github'] as const
export type Fournisseur = (typeof PRIS_EN_CHARGE)[number]

/**
 * Fournisseurs de connexion (Discord…) activés dans le tableau de bord Supabase, lus auprès du
 * serveur : un fournisseur activé apparaît sur la page de connexion sans redéployer le site.
 */
let fournisseurs: Fournisseur[] = []
const abonnesFournisseurs = new Set<() => void>()
if (url && cle) {
  fetch(`${url}/auth/v1/settings`, { headers: { apikey: cle } })
    .then((r) => (r.ok ? r.json() : null))
    .then((reglages: { external?: Record<string, boolean> } | null) => {
      fournisseurs = PRIS_EN_CHARGE.filter((f) => reglages?.external?.[f] === true)
      abonnesFournisseurs.forEach((a) => a())
    })
    .catch(() => {})
}

export function useFournisseurs(): Fournisseur[] {
  return useSyncExternalStore(
    (a) => {
      abonnesFournisseurs.add(a)
      return () => abonnesFournisseurs.delete(a)
    },
    () => fournisseurs,
  )
}

export type StatutCompte = 'indisponible' | 'deconnecte' | 'chargement' | 'connecte'

export interface Compte {
  statut: StatutCompte
  email?: string
}

let compte: Compte = { statut: supabase ? 'chargement' : 'indisponible' }
let utilisateur: string | null = null
const abonnes = new Set<() => void>()

function majCompte(c: Compte) {
  compte = c
  abonnes.forEach((a) => a())
}

export function useCompte(): Compte {
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => compte,
  )
}

// ---------- Correspondance serveur → état du jeu ----------

export interface ProfilServeur {
  pseudo: string | null
  credits: number
  xp: number
  boosters: number
  dernier_booster: string
  meilleur_adversaire: number
  stats: Sauvegarde['stats']
  equipe: string[]
  favoris: string[]
  souhaits: string[]
  nouvelles: string[]
  affichage: Record<string, IdVariante>
  langue: Langue
  souvenir_importe: boolean
}

interface EtatServeur {
  profil: ProfilServeur
  collection: { c: string; v: IdVariante; n: number; s: number }[]
}

/** Champs de valeur : seul le serveur les modifie, le client recopie sa réponse. */
export function appliquerProfil(s: Sauvegarde, p: ProfilServeur): Sauvegarde {
  return {
    ...s,
    agent: p.pseudo ?? '',
    credits: Number(p.credits),
    xp: p.xp,
    boosters: p.boosters,
    dernierBooster: Date.parse(p.dernier_booster),
    meilleurAdversaire: p.meilleur_adversaire,
    stats: { ...s.stats, ...p.stats },
  }
}

function depuisServeur(e: EtatServeur): Sauvegarde {
  const s: Sauvegarde = {
    ...appliquerProfil(sauvegardeVide(), e.profil),
    deck: e.profil.equipe,
    favoris: e.profil.favoris,
    souhaits: e.profil.souhaits,
    nouvelles: e.profil.nouvelles,
    affichage: e.profil.affichage,
    langue: e.profil.langue,
  }
  for (const { c, v, n, s: souvenirs } of e.collection) {
    s.collection[c] = (s.collection[c] ?? 0) + n
    if (v === 'std') s.souvenirs[c] = (s.souvenirs[c] ?? 0) + souvenirs
    else s.variantes[c] = { ...s.variantes[c], [v]: n }
  }
  return s
}

// ---------- Appels au serveur ----------

/** Messages lisibles pour les erreurs réseau et d'authentification les plus courantes. */
function messageErreur(message?: string): string {
  if (!message || /fetch|network|load failed/i.test(message)) return 'Le serveur de la Fondation est injoignable. Vérifiez votre connexion.'
  if (/rate limit|too many/i.test(message)) return 'Trop de tentatives : réessayez dans quelques minutes.'
  if (/jwt|session|not authenticated|Connexion requise/i.test(message)) return 'Session expirée : reconnectez-vous.'
  return message
}

/** Appelle une fonction du serveur ; en cas d'erreur, prévient le joueur et renvoie null. */
export async function appeler<T>(fonction: string, params?: Record<string, unknown>): Promise<T | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc(fonction, params)
  if (error) {
    notifier(messageErreur(error.message))
    return null
  }
  return data as T
}

/** Appelle la fonction Edge « duel » (duels arbitrés par le serveur) ; en cas d'erreur, prévient le joueur et renvoie null. */
export async function appelerDuel<T>(action: 'debuter' | 'jouer' | 'repondre', params: Record<string, unknown>): Promise<T | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke('duel', { body: { action, ...params } })
  if (error) {
    // Le message du serveur (accréditation, équipe…) est dans le corps de la réponse
    const reponse = (error as { context?: Response }).context
    const message = reponse ? ((await reponse.json().catch(() => null)) as { message?: string } | null)?.message : undefined
    notifier(messageErreur(message ?? error.message))
    return null
  }
  return data as T
}

export async function rechargerEtat(): Promise<boolean> {
  const etat = await appeler<EtatServeur>('mon_etat')
  if (!etat) return false
  remplacer(depuisServeur(etat))
  majCompte({ ...compte, statut: 'connecte' })
  return true
}

// ---------- Préférences : envoyées au serveur peu après chaque changement ----------

const PREFERENCES = {
  deck: 'equipe',
  favoris: 'favoris',
  souhaits: 'souhaits',
  nouvelles: 'nouvelles',
  affichage: 'affichage',
  langue: 'langue',
} as const satisfies Partial<Record<keyof Sauvegarde, string>>

let enAttente: Record<string, unknown> = {}
let minuterie: ReturnType<typeof setTimeout> | undefined

surModification((avant, apres) => {
  if (compte.statut !== 'connecte') return
  for (const [local, serveur] of Object.entries(PREFERENCES)) {
    const k = local as keyof typeof PREFERENCES
    if (avant[k] !== apres[k]) enAttente[serveur] = apres[k]
  }
  if (!Object.keys(enAttente).length) return
  clearTimeout(minuterie)
  minuterie = setTimeout(() => {
    const envoi = enAttente
    enAttente = {}
    void appeler('maj_preferences', { p: envoi })
  }, 800)
})

// ---------- Connexion ----------

if (supabase) {
  supabase.auth.onAuthStateChange((evenement, session) => {
    if (session) {
      // Rafraîchissement de jeton ou retour sur l'onglet : même joueur, rien à recharger
      if (utilisateur === session.user.id && evenement !== 'USER_UPDATED') return
      utilisateur = session.user.id
      majCompte({ statut: 'chargement', email: session.user.email })
      // Hors du rappel : Supabase déconseille d'attendre une requête à l'intérieur
      setTimeout(() => {
        void rechargerEtat().then((ok) => {
          if (!ok) majCompte({ statut: 'deconnecte' })
        })
      }, 0)
    } else {
      utilisateur = null
      majCompte({ statut: 'deconnecte' })
      vider()
    }
  })
}

export async function connexionEmail(email: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
  if (error) {
    notifier(messageErreur(error.message))
    return false
  }
  return true
}

/** Connexion par le code reçu dans l'e-mail : utile quand le lien s'ouvre dans un autre navigateur. */
export async function verifierCode(email: string, code: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) {
    notifier(/expired|invalid/i.test(error.message) ? 'Code invalide ou expiré' : messageErreur(error.message))
    return false
  }
  return true
}

export async function connexionFournisseur(fournisseur: Fournisseur) {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOAuth({ provider: fournisseur, options: { redirectTo: window.location.origin } })
  if (error) notifier(messageErreur(error.message))
}

/** Envoie tout de suite les préférences en attente (avant un duel, le serveur doit connaître l'équipe). */
export async function envoyerPreferences() {
  clearTimeout(minuterie)
  const envoi = enAttente
  enAttente = {}
  if (Object.keys(envoi).length) await appeler('maj_preferences', { p: envoi })
}

export async function deconnexion() {
  await envoyerPreferences()
  await supabase?.auth.signOut()
}

export async function supprimerCompte() {
  if (await appeler<boolean>('supprimer_mon_compte')) await supabase?.auth.signOut()
}
