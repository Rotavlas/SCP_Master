/**
 * Les notes de version sur le Discord : le serveur les publie une seule fois (public.publier_version, réservée au
 * créateur), sur le webhook rangé dans prive.discord. Le créateur les envoie en chargeant la nouvelle version.
 */
import { useEffect, useState } from 'react'
import { JOURNAL } from '../data/journal'
import { supabase } from './enLigne'

const cle = () => `scp-masters:version-publiee:${JOURNAL[0].date}:${JOURNAL[0].titre}`

/** Publie la dernière entrée du journal ; vrai si le message est parti (faux : déjà publiée, ou pas de webhook) */
export async function publierVersion(): Promise<boolean> {
  if (!supabase) return false
  const j = JOURNAL[0]
  const { data, error } = await supabase.rpc('publier_version', { p_date: j.date, p_titre: j.titre, p_points: j.points })
  if (error || data !== true) return false
  try {
    localStorage.setItem(cle(), '1')
  } catch {
    // Sans importance : le serveur ne publie jamais deux fois
  }
  return true
}

/** Le créateur charge une nouvelle version : ses notes partent sur le Discord (une fois) */
export function usePublierVersion(createur: boolean) {
  useEffect(() => {
    if (!createur) return
    try {
      if (localStorage.getItem(cle()) === '1') return
    } catch {
      // On tente quand même : le serveur évite les doublons
    }
    void publierVersion()
  }, [createur])
}

// ---------- Compte Discord lié et grade sur le serveur ----------

export interface EtatDiscord {
  lie: boolean
  /** Le dernier grade posé sur le serveur Discord (nul : jamais) */
  grade: number | null
  niveau: number
}

/** Réponse de la fonction Edge : membre faux si l'agent n'a pas encore rejoint le serveur */
export interface ResultatGrade {
  lie: boolean
  membre?: boolean
  niveau?: number
}

export async function lireDiscord(): Promise<EtatDiscord | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('mon_discord')
  return error ? null : (data as EtatDiscord)
}

/** Pose le grade du niveau d'accréditation ; sans message d'erreur à l'écran (le bouton de Mon agent les affiche) */
export async function synchroniserGrade(): Promise<ResultatGrade | { erreur: string }> {
  if (!supabase) return { erreur: 'Hors ligne' }
  const { data, error } = await supabase.functions.invoke('duel', { body: { action: 'discord_grade' } })
  if (!error) return data as ResultatGrade
  const reponse = (error as { context?: Response }).context
  const message = reponse ? ((await reponse.json().catch(() => null)) as { message?: string } | null)?.message : undefined
  return { erreur: message ?? error.message }
}

/** Relie un compte Discord au compte de l'agent (retour sur le site après l'accord de Discord) */
export async function lierDiscord(): Promise<string | null> {
  if (!supabase) return 'Hors ligne'
  const { error } = await supabase.auth.linkIdentity({ provider: 'discord', options: { redirectTo: window.location.origin } })
  if (!error) return null
  return /manual linking/i.test(error.message) ? 'La liaison de comptes n’est pas encore ouverte sur le serveur du jeu' : error.message
}

/**
 * Le grade suit le niveau : à l'ouverture du jeu et à chaque nouveau niveau, si le grade posé ne correspond plus,
 * la fonction Edge le repose. Une tentative par niveau et par visite au plus (un agent hors du serveur Discord
 * ne déclenche pas un appel à chaque chargement de page).
 */
export function useGradeDiscord(actif: boolean, niveau: number) {
  useEffect(() => {
    if (!actif) return
    const cle = `scp-masters:grade-discord:${niveau}`
    try {
      if (sessionStorage.getItem(cle) === '1') return
      sessionStorage.setItem(cle, '1')
    } catch {
      // Navigation privée : on tente quand même
    }
    void lireDiscord().then((d) => {
      if (d?.lie && d.grade !== d.niveau) void synchroniserGrade()
    })
  }, [actif, niveau])
}

// ---------- Widget du serveur : les membres en ligne ----------

export interface WidgetDiscord {
  enLigne: number
  invitation: string | null
}

const SERVEUR = '1569271113001865256'
let widget: { quand: number; valeur: WidgetDiscord | null } | null = null

/** Le nombre d'agents en ligne sur le Discord (widget public du serveur, gardé 5 minutes) */
export function useWidgetDiscord(): WidgetDiscord | null {
  const [valeur, setValeur] = useState<WidgetDiscord | null>(widget?.valeur ?? null)
  useEffect(() => {
    if (widget && Date.now() - widget.quand < 5 * 60_000) return
    let vivant = true
    fetch(`https://discord.com/api/guilds/${SERVEUR}/widget.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { presence_count?: number; instant_invite?: string | null } | null) => {
        const v = d && typeof d.presence_count === 'number' ? { enLigne: d.presence_count, invitation: d.instant_invite ?? null } : null
        widget = { quand: Date.now(), valeur: v }
        if (vivant) setValeur(v)
      })
      .catch(() => {
        widget = { quand: Date.now(), valeur: null }
      })
    return () => {
      vivant = false
    }
  }, [])
  return valeur
}
