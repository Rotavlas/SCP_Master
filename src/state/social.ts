/**
 * Amis, clans, messagerie, classements et profils publics. Tout passe par les fonctions SQL du serveur
 * (supabase/migrations/20261028090000_social_et_jcj.sql) ; les messages arrivent en direct.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { IdVariante } from '../engine/variantes'
import { appeler, idUtilisateur, supabase } from './enLigne'
import { notifier } from './sauvegarde'

// ---------- Présence ----------

/** Signale au serveur que le joueur est en ligne, toutes les minutes tant que la page est ouverte. */
export function usePresence(actif: boolean) {
  useEffect(() => {
    if (!actif) return
    void appeler('signaler_presence')
    const t = setInterval(() => void appeler('signaler_presence'), 60_000)
    return () => clearInterval(t)
  }, [actif])
}

// ---------- Profils et classements ----------

export type Tableau = 'elo' | 'collection' | 'richesse' | 'legendaires' | 'victoires' | 'xp'

export interface LigneClassement {
  rang: number
  pseudo: string
  valeur: number
  clan: string | null
  moi: boolean
}

export interface Classement {
  lignes: LigneClassement[]
  moi: { rang: number; valeur: number } | null
  joueurs: number
}

export interface LigneClan {
  rang: number
  nom: string
  tag: string
  embleme: string | null
  score: number
  membres: number
  moi: boolean
}

export interface BilanJcj {
  victoires: number
  defaites: number
  nuls: number
}

export type Relation = 'ami' | 'demande_envoyee' | 'demande_recue' | 'bloque' | 'aucune' | null

export interface ProfilPublic {
  pseudo: string
  xp: number
  elo: number
  rangElo: number
  credits: number
  jcj: BilanJcj
  stats: { duels: number; victoires: number }
  enLigne: boolean
  vuLe: string
  creeLe: string
  moi: boolean
  collection: number
  legendaires: number
  vitrine: { carte: string; variante: IdVariante }[]
  clan: { nom: string; tag: string; role: RoleClan } | null
  relation: Relation
  duels: { adversaire: string; issue: 'victoire' | 'defaite' | 'nul'; classe: boolean; le: string }[]
}

export const classement = (tableau: Tableau) => appeler<Classement>('classement', { p_tableau: tableau })
export const classementClans = () => appeler<LigneClan[]>('classement_clans')
export const profilPublic = (pseudo: string) => appeler<ProfilPublic>('profil_public', { p_pseudo: pseudo })
export const majVitrine = (cartes: string[]) => appeler<string[]>('maj_vitrine', { p_cartes: cartes })

// ---------- Amis ----------

export interface Ami {
  pseudo: string
  elo: number
  enLigne: boolean
  vuLe: string
  clan: string | null
}

export interface MesAmis {
  amis: Ami[]
  recues: string[]
  envoyees: string[]
  bloques: string[]
}

export const mesAmis = () => appeler<MesAmis>('mes_amis')
export const chercherJoueurs = (texte: string) => appeler<string[]>('chercher_joueurs', { p_texte: texte })

export async function demanderAmi(pseudo: string) {
  const r = await appeler<'ami' | 'demande'>('demander_ami', { p_pseudo: pseudo })
  if (r) notifier(r === 'ami' ? `${pseudo} et vous êtes maintenant amis` : `Demande d'ami envoyée à ${pseudo}`, 'succes')
  return r
}
export const repondreAmi = (pseudo: string, accepter: boolean) => appeler<boolean>('repondre_ami', { p_pseudo: pseudo, p_accepter: accepter })
export const retirerAmi = (pseudo: string) => appeler<boolean>('retirer_ami', { p_pseudo: pseudo })
export const bloquer = (pseudo: string) => appeler<boolean>('bloquer', { p_pseudo: pseudo })
export const debloquer = (pseudo: string) => appeler<boolean>('debloquer', { p_pseudo: pseudo })

// ---------- Clans ----------

export type RoleClan = 'chef' | 'officier' | 'membre'

export interface ResumeClan {
  nom: string
  tag: string
  description: string
  embleme: string | null
  ouvert: boolean
  membres: number
  score: number
}

export interface FicheClan {
  nom: string
  tag: string
  description: string
  embleme: string | null
  ouvert: boolean
  creeLe: string
  score: number
  monRole: RoleClan | null
  candidat: boolean
  membres: { pseudo: string; role: RoleClan; elo: number; victoires: number; enLigne: boolean }[]
  candidatures: { pseudo: string; elo: number }[] | null
}

/** Sans clan, le serveur renvoie seulement les candidatures en attente */
export type MonClan = FicheClan | { candidatures: string[]; tag?: undefined }

export const COUT_CLAN = 2000
export const listeClans = (recherche: string) => appeler<ResumeClan[]>('liste_clans', { p_recherche: recherche })
export const ficheClan = (tag: string) => appeler<FicheClan>('fiche_clan', { p_tag: tag })
export const monClan = () => appeler<MonClan>('fiche_clan', { p_tag: '' })
export const creerClan = (nom: string, tag: string, description: string, ouvert: boolean) =>
  appeler<string>('creer_clan', { p_nom: nom, p_tag: tag, p_description: description, p_ouvert: ouvert })
export const rejoindreClan = (tag: string) => appeler<'membre' | 'candidature'>('rejoindre_clan', { p_tag: tag })
export const quitterClan = () => appeler<boolean>('quitter_clan')
export type ActionMembre = 'accepter' | 'refuser' | 'exclure' | 'promouvoir' | 'retrograder' | 'chef'
export const gererMembre = (pseudo: string, action: ActionMembre) => appeler<boolean>('gerer_membre', { p_pseudo: pseudo, p_action: action })
export const modifierClan = (description: string, ouvert: boolean, embleme: string | null) =>
  appeler<boolean>('modifier_clan', { p_description: description, p_ouvert: ouvert, p_embleme: embleme })

// ---------- Messagerie ----------

/** Une conversation : le salon de son clan, ou les messages privés avec un ami */
export interface Destinataire {
  type: 'clan' | 'mp'
  /** Pseudo de l'ami (messages privés) ou tag du clan */
  cible: string
}

export interface Message {
  id: number
  pseudo: string
  texte: string
  creeLe: string
  moi: boolean
}

export interface Conversation extends Destinataire {
  enLigne: boolean | null
  dernier: { pseudo: string; texte: string; creeLe: string } | null
  nonLus: number
}

const cibleServeur = (d: Destinataire) => (d.type === 'mp' ? d.cible : null)

export const messagesSalon = (d: Destinataire, avant?: number) =>
  appeler<{ salon: string; messages: Message[] }>('messages_salon', { p_type: d.type, p_cible: cibleServeur(d), p_avant: avant ?? null })
export const envoyerMessage = (d: Destinataire, texte: string) =>
  appeler<Message & { salon: string }>('envoyer_message', { p_type: d.type, p_cible: cibleServeur(d), p_texte: texte })
export const signalerMessage = (id: number, raison: string) => appeler<boolean>('signaler_message', { p_message: id, p_raison: raison })

/** Les nouveaux messages d'un salon, en direct (la règle de lecture du serveur filtre déjà les salons). */
export function useDirectSalon(salon: string | null, recevoir: (m: Message) => void) {
  const rappel = useRef(recevoir)
  rappel.current = recevoir
  useEffect(() => {
    if (!supabase || !salon) return
    const canal = supabase
      .channel(`salon-${salon}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `salon=eq.${salon}` }, (p) => {
        const m = p.new as { id: number; pseudo: string; texte: string; cree_le: string; auteur: string | null }
        rappel.current({ id: m.id, pseudo: m.pseudo, texte: m.texte, creeLe: m.cree_le, moi: m.auteur === idUtilisateur() })
      })
      .subscribe()
    return () => void supabase?.removeChannel(canal)
  }, [salon])
}

// ---------- Messages non lus : un compteur pour l'onglet Social ----------

let conversationsConnues: Conversation[] = []
let ouverte: string | null = null
const abonnes = new Set<() => void>()

export async function rafraichirConversations() {
  const c = await appeler<Conversation[]>('conversations')
  if (!c) return
  conversationsConnues = c
  abonnes.forEach((a) => a())
}

/** La conversation affichée à l'écran : ses messages ne comptent pas comme non lus. */
export function conversationOuverte(d: Destinataire | null) {
  ouverte = d ? `${d.type}:${d.cible}` : null
}

export function useConversations(): Conversation[] {
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => conversationsConnues,
  )
}

export const totalNonLus = (c: Conversation[]) => c.reduce((t, x) => t + (ouverte === `${x.type}:${x.cible}` ? 0 : x.nonLus), 0)

/**
 * Tout nouveau message lisible (son clan, ses messages privés) rafraîchit les compteurs et prévient
 * le joueur s'il n'est pas sur la conversation.
 */
export function useMessagesEntrants(actif: boolean) {
  useEffect(() => {
    if (!supabase || !actif) return
    void rafraichirConversations()
    let minuterie: ReturnType<typeof setTimeout> | undefined
    const canal = supabase
      .channel('messages-entrants')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        const m = p.new as { pseudo: string; salon: string; auteur: string | null; texte: string }
        if (m.auteur === idUtilisateur()) return
        clearTimeout(minuterie)
        minuterie = setTimeout(() => void rafraichirConversations(), 400)
        const conv = conversationsConnues.find((c) => (m.salon.startsWith('clan:') ? c.type === 'clan' : c.type === 'mp' && c.cible === m.pseudo))
        if (!conv || ouverte !== `${conv.type}:${conv.cible}`) {
          notifier(`${m.salon.startsWith('clan:') ? '[Clan] ' : ''}${m.pseudo} : ${m.texte.slice(0, 60)}`)
        }
      })
      .subscribe()
    const t = setInterval(() => void rafraichirConversations(), 120_000)
    return () => {
      clearTimeout(minuterie)
      clearInterval(t)
      void supabase?.removeChannel(canal)
    }
  }, [actif])
}
