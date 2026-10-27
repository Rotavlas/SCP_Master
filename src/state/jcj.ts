/**
 * Duels entre joueurs, côté navigateur. Le serveur arbitre tout (serveur/jcj.ts) ; ce module appelle ses
 * actions et suit le duel en direct : chaque changement de public.duels_jcj déclenche une relecture.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { appeler, appelerDuel, appliquerProfil, idUtilisateur, supabase, type ProfilServeur } from './enLigne'
import { modifier } from './sauvegarde'

export type Cote = 'a' | 'b'
type ParCote<T> = Record<Cote, T>

export interface EtatJcj {
  manche: number
  phase: 'choix' | 'question' | 'fin'
  echeance: number
  maintenant: number
  pv: ParCote<number>
  jouees: ParCote<string[]>
  choisi: ParCote<boolean>
  repondu: ParCote<boolean>
  question?: { intitule: string; document?: string; options: string[]; surCarteDe: Cote }
  dernier?: {
    manche: number
    intitule: string
    options: string[]
    bonne: number
    choix: ParCote<number | null>
    temps: ParCote<number>
    degats: ParCote<number>
    cartes: ParCote<string>
  }
  fin?: { issue: Cote | 'nul'; abandon?: Cote }
}

export interface VueDuel {
  id: string
  cote: Cote
  classe: boolean
  statut: 'invitation' | 'preparation' | 'en_cours' | 'termine' | 'annule'
  moi: { pseudo: string; elo: number }
  adversaire: { pseudo: string; elo: number }
  etat: EtatJcj
  main: string[]
  maCarte: string | null
  gains: { credits: number; xp: number; elo: number } | null
  profil?: ProfilServeur | null
}

export interface TableauDuels {
  elo: number
  jcj: { victoires: number; defaites: number; nuls: number }
  rang: number
  enLigne: number
  enFile: number
  iaRestants: number
  jcjRestants: number
  enCours: string | null
  invitations: { id: string; pseudo: string; elo: number }[]
  amisEnLigne: { pseudo: string; elo: number; occupe: boolean }[]
}

export const tableauDuels = () => appeler<TableauDuels>('tableau_duels')

/** Le joueur qui termine le duel reçoit son profil à jour ; l'autre le relit (crédits, XP). */
function appliquer(v: VueDuel | null): VueDuel | null {
  const profil = v?.profil
  if (profil) modifier((x) => appliquerProfil(x, profil))
  return v
}

export async function entrerFile() {
  const r = await appelerDuel<{ attente?: boolean; enFile?: number; duel?: VueDuel }>('jcj_file')
  if (r?.duel) appliquer(r.duel)
  return r
}
export const quitterFile = () => appelerDuel<{ ok: boolean }>('jcj_quitter')
export const defier = (pseudo: string) => appelerDuel<{ id: string }>('jcj_defier', { pseudo })
export async function repondreDefi(id: string, accepter: boolean) {
  const r = await appelerDuel<{ refuse?: boolean; duel?: VueDuel }>('jcj_repondre_defi', { id, accepter })
  if (r?.duel) appliquer(r.duel)
  return r
}
export const etatDuel = async (id: string) => appliquer(await appelerDuel<VueDuel>('jcj_etat', { id }))
export const jouerCarteJcj = async (id: string, carte: string) => appliquer(await appelerDuel<VueDuel>('jcj_jouer', { id, carte }))
export const repondreJcj = async (id: string, choix: number) => appliquer(await appelerDuel<VueDuel>('jcj_repondre', { id, choix }))
export const abandonner = async (id: string) => appliquer(await appelerDuel<VueDuel>('jcj_abandonner', { id }))

/** Suit un duel en direct : à chaque écriture du serveur, `relire` est appelé (regroupé). */
export function useDirectDuel(id: string | null, relire: () => void) {
  const rappel = useRef(relire)
  rappel.current = relire
  useEffect(() => {
    if (!supabase || !id) return
    let minuterie: ReturnType<typeof setTimeout> | undefined
    const canal = supabase
      .channel(`duel-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duels_jcj', filter: `id=eq.${id}` }, () => {
        clearTimeout(minuterie)
        minuterie = setTimeout(() => rappel.current(), 120)
      })
      .subscribe()
    return () => {
      clearTimeout(minuterie)
      void supabase?.removeChannel(canal)
    }
  }, [id])
}

// ---------- Invitations et appariements, partout dans le jeu ----------

export interface Invitation {
  id: string
  pseudo: string
  elo: number
}

let invitations: Invitation[] = []
/** Un duel vient de commencer pour ce joueur (appariement ou défi accepté par l'adversaire) */
let duelDemarre: string | null = null
/** Duels déjà signalés : les mises à jour d'un duel en cours ne le « redémarrent » pas */
const connus = new Set<string>()
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((a) => a())

export async function rafraichirInvitations() {
  const t = await tableauDuels()
  if (!t) return null
  invitations = t.invitations
  prevenir()
  return t
}

export function oublierInvitation(id: string) {
  invitations = invitations.filter((i) => i.id !== id)
  prevenir()
}

export function useInvitations(): Invitation[] {
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => invitations,
  )
}

/** Identifiant d'un duel qui vient de démarrer (lu une fois par l'écran Confrontation). */
/** Un duel ouvert depuis cet onglet (file, défi accepté) n'a pas besoin d'être signalé à nouveau. */
export function marquerConnu(id: string) {
  connus.add(id)
}

export function useDuelDemarre(): [string | null, () => void] {
  const id = useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => duelDemarre,
  )
  return [
    id,
    () => {
      duelDemarre = null
      prevenir()
    },
  ]
}

/**
 * Écoute ses propres duels : un défi reçu (invitation), ou un duel qui démarre (appariement dans la file,
 * ou défi qu'on avait lancé et que l'ami vient d'accepter).
 */
export function useDuelsEntrants(actif: boolean) {
  useEffect(() => {
    const moi = idUtilisateur()
    if (!supabase || !actif || !moi) return
    void rafraichirInvitations()
    const surChangement = (p: { new: Record<string, unknown> }) => {
      const d = p.new as { id: string; statut: string; joueur_b: string }
      if (d.statut === 'invitation' && d.joueur_b === moi) void rafraichirInvitations()
      else if (d.statut === 'en_cours' || d.statut === 'preparation') {
        if (!connus.has(d.id)) {
          connus.add(d.id)
          duelDemarre = d.id
          oublierInvitation(d.id)
          prevenir()
        }
      } else if (d.statut === 'annule') oublierInvitation(d.id)
    }
    const canal = supabase
      .channel('mes-duels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duels_jcj', filter: `joueur_a=eq.${moi}` }, surChangement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duels_jcj', filter: `joueur_b=eq.${moi}` }, surChangement)
      .subscribe()
    return () => void supabase?.removeChannel(canal)
  }, [actif])
}
