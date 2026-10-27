/**
 * Hôtel des ventes, cours des cartes, échanges et brûlage : appels aux fonctions du serveur.
 * Le serveur réserve, prélève, transfère et rend ; le client affiche et recharge l'état du joueur.
 */
import { useEffect, useRef } from 'react'
import type { IdVariante } from '../engine/variantes'
import { appeler, appliquerProfil, rechargerEtat, supabase, type ProfilServeur } from './enLigne'
import { modifier, notifier } from './sauvegarde'

export interface Enchere {
  id: string
  carte: string
  variante: IdVariante
  serie: number | null
  prixDepart: number
  achatImmediat: number | null
  mise: number | null
  nbMises: number
  fin: string
  vendeur: string
  /** Pseudo du meilleur enchérisseur */
  meneur: string | null
  aMoi: boolean
  enTete: boolean
}

export interface VenteClose {
  id: string
  carte: string
  variante: IdVariante
  serie: number | null
  statut: 'vendue' | 'invendue' | 'annulee'
  mise: number | null
  close: string
  /** true : j'étais le vendeur ; false : l'acheteur */
  vendu: boolean
}

export interface EtatMarche {
  maintenant: string
  ouvertes: Enchere[]
  historique: VenteClose[]
}

export interface CoursVariante {
  brulage: number
  dernier: number | null
  mediane7: number | null
  min30: number | null
  max30: number | null
  volume30: number
  /** [date ISO, prix], du plus ancien au plus récent */
  points: [string, number][]
  enVente: number
  /** Mes exemplaires libres (vendables, échangeables, brûlables) */
  libres: number
  /** Mes exemplaires réservés par une vente ou une offre */
  reserves: number
}

export interface Cours {
  variantes: Record<IdVariante, CoursVariante>
}

export interface LigneOffre {
  c: string
  v: IdVariante
  s: number | null
}

export interface Offre {
  id: string
  recue: boolean
  avec: string
  statut: 'ouverte' | 'acceptee' | 'refusee' | 'annulee' | 'expiree'
  creditsDe: number
  creditsA: number
  message: string | null
  cree: string
  expire: string
  close: string | null
  donne: LigneOffre[]
  demande: LigneOffre[]
}

export interface Disponible {
  c: string
  v: IdVariante
  n: number
}

// ---------- Hôtel des ventes ----------

export const chargerMarche = () => appeler<EtatMarche>('marche')

export async function mettreAuxEncheres(carte: string, variante: IdVariante, prix: number, dureeMinutes: number, achatImmediat: number | null): Promise<boolean> {
  const r = await appeler<{ id: string }>('mettre_aux_encheres', {
    p_carte: carte,
    p_variante: variante,
    p_prix: prix,
    p_duree_minutes: dureeMinutes,
    p_achat_immediat: achatImmediat,
  })
  if (!r) return false
  await rechargerEtat()
  return true
}

export async function encherir(idEnchere: string, montant: number): Promise<{ mise: number; immediat: boolean } | null> {
  const r = await appeler<{ mise: number; immediat: boolean; profil: ProfilServeur }>('encherir', { p_enchere: idEnchere, p_montant: montant })
  if (!r) return null
  if (r.immediat) await rechargerEtat()
  else modifier((x) => appliquerProfil(x, r.profil))
  return r
}

export async function annulerEnchere(idEnchere: string): Promise<boolean> {
  const ok = await appeler<boolean>('annuler_enchere', { p_enchere: idEnchere })
  if (ok) await rechargerEtat()
  return !!ok
}

export interface Mise {
  pseudo: string
  montant: number
  le: string
  moi: boolean
}

/** Les 50 dernières mises d'une enchère, de la plus récente à la plus ancienne */
export const historiqueMises = (idEnchere: string) => appeler<Mise[]>('historique_mises', { p_enchere: idEnchere })

export const chargerCours = (carte: string) => appeler<Cours>('cours_carte', { p_carte: carte })

/**
 * Le direct : chaque mise, vente ou nouvelle enchère, chez n'importe quel joueur, déclenche `rafraichir`
 * (regroupé, pour qu'une rafale de mises ne fasse qu'un rechargement).
 */
export function useDirectEncheres(rafraichir: () => void) {
  const rappel = useRef(rafraichir)
  rappel.current = rafraichir
  useEffect(() => {
    if (!supabase) return
    let minuterie: ReturnType<typeof setTimeout> | undefined
    const canal = supabase
      .channel('encheres')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'encheres' }, () => {
        clearTimeout(minuterie)
        minuterie = setTimeout(() => rappel.current(), 300)
      })
      .subscribe()
    return () => {
      clearTimeout(minuterie)
      void supabase?.removeChannel(canal)
    }
  }, [])
}

// ---------- Brûler ----------

export async function bruler(carte: string, variante: IdVariante): Promise<number | null> {
  const r = await appeler<{ gain: number; profil: ProfilServeur }>('bruler', { p_carte: carte, p_variante: variante })
  if (!r) return null
  await rechargerEtat()
  notifier(`Dossier incinéré : +${r.gain.toLocaleString('fr-FR')} ₵`, 'succes')
  return r.gain
}

// ---------- Échanges ----------

export const chercherJoueurs = (texte: string) => appeler<string[]>('chercher_joueurs', { p_texte: texte })
export const collectionEchangeable = (pseudo: string) => appeler<Disponible[]>('collection_echangeable', { p_pseudo: pseudo })
export const mesEchanges = () => appeler<Offre[]>('mes_echanges')

export async function proposerEchange(
  pseudo: string,
  donne: { c: string; v: IdVariante }[],
  demande: { c: string; v: IdVariante }[],
  creditsDonnes: number,
  creditsDemandes: number,
  message: string,
): Promise<boolean> {
  const r = await appeler<{ id: string }>('proposer_echange', {
    p_pseudo: pseudo,
    p_donne: donne,
    p_demande: demande,
    p_credits_donnes: creditsDonnes,
    p_credits_demandes: creditsDemandes,
    p_message: message,
  })
  if (!r) return false
  await rechargerEtat()
  notifier(`Offre envoyée à ${pseudo}`, 'succes')
  return true
}

export async function repondreEchange(idOffre: string, accepter: boolean): Promise<boolean> {
  const r = await appeler<{ accepte: boolean }>('repondre_echange', { p_offre: idOffre, p_accepter: accepter })
  if (!r) return false
  await rechargerEtat()
  notifier(accepter ? 'Échange conclu' : 'Offre refusée', accepter ? 'succes' : 'info')
  return true
}

export async function annulerEchange(idOffre: string): Promise<boolean> {
  const r = await appeler<unknown>('annuler_echange', { p_offre: idOffre })
  if (!r) return false
  await rechargerEtat()
  return true
}
