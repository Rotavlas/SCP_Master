/**
 * Les statistiques personnelles : chaque réponse en combat est comptée par famille de questions (classe, surnom,
 * extrait…), avec son temps. Le cumul part au serveur une fois le combat calmé (public.ajouter_statistiques), pas à
 * chaque réponse ; ce qui n'est pas encore parti est gardé sur l'appareil.
 */
import { useEffect, useState } from 'react'
import { supabase } from './enLigne'

/** Sans message d'erreur à l'écran : les statistiques ne doivent jamais gêner la partie */
async function rpc<T>(fonction: string, params?: Record<string, unknown>): Promise<T | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc(fonction, params)
  return error ? null : (data as T)
}

export const FAMILLES: Record<string, string> = {
  classe: 'Classe de confinement',
  surnom: 'Surnom',
  designation: 'Désignation',
  extrait: 'Extraits de dossier',
  procedures: 'Procédures',
  tags: 'Tags du wiki',
  categorie: 'Fonction, genre, Groupe',
  liens: 'Liens entre dossiers',
  annee: 'Année de publication',
  auteur: 'Auteur',
  rarete: 'Rareté',
  illustration: 'Illustrations',
  autre: 'Autres',
}

/** La famille d'une question, d'après son intitulé (le serveur ne l'envoie pas) */
export function famille(intitule: string, image?: string): string {
  if (image) return 'illustration'
  const regles: [RegExp, string][] = [
    [/classe de confinement/i, 'classe'],
    [/Quel est le surnom/i, 'surnom'],
    [/porte le surnom/i, 'designation'],
    [/procédures/i, 'procedures'],
    [/extrait/i, 'extrait'],
    [/tags du wiki/i, 'tags'],
    [/fonction de|genre du conte|Groupe d'intérêt/i, 'categorie'],
    [/participé|implique|confinée au|est-il lié/i, 'liens'],
    [/En quelle année/i, 'annee'],
    [/Qui a écrit/i, 'auteur'],
    [/rareté/i, 'rarete'],
  ]
  return regles.find(([r]) => r.test(intitule))?.[1] ?? 'autre'
}

interface Envoi {
  familles: Record<string, { n: number; b: number; t: number }>
  serie: number
  eclair?: number
}

export interface Statistiques {
  familles?: Record<string, { n: number; b: number; t: number }>
  serie?: number
  eclair?: number
}

const CLE = 'scp-masters:statistiques-en-attente'
const vide = (): Envoi => ({ familles: {}, serie: 0 })

function lire(): Envoi {
  try {
    const x = JSON.parse(localStorage.getItem(CLE) ?? 'null') as Envoi | null
    return x && typeof x === 'object' && x.familles ? x : vide()
  } catch {
    return vide()
  }
}

let attente: Envoi = lire()
let minuterie = 0

function garder() {
  try {
    localStorage.setItem(CLE, JSON.stringify(attente))
  } catch {
    // Navigation privée : le cumul partira quand même au prochain envoi
  }
}

async function envoyer() {
  clearTimeout(minuterie)
  const envoi = attente
  if (!Object.keys(envoi.familles).length) return
  attente = vide()
  garder()
  const r = await rpc<Statistiques>('ajouter_statistiques', { p: envoi })
  if (r === null) {
    // Pas de réseau : on recommencera avec ce qui s'ajoute entre-temps
    for (const [k, v] of Object.entries(envoi.familles)) {
      const a = (attente.familles[k] ??= { n: 0, b: 0, t: 0 })
      a.n += v.n
      a.b += v.b
      a.t += v.t
    }
    attente.serie = Math.max(attente.serie, envoi.serie)
    garder()
  }
}

// L'application qu'on quitte envoie ce qui reste
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void envoyer()
  })

/** Une réponse donnée en combat */
export function compterReponse(intitule: string, image: string | undefined, juste: boolean, temps: number, serie: number) {
  const k = famille(intitule, image)
  const a = (attente.familles[k] ??= { n: 0, b: 0, t: 0 })
  a.n++
  if (juste) a.b++
  a.t = Math.round((a.t + Math.max(0, Math.min(40, temps))) * 10) / 10
  attente.serie = Math.max(attente.serie, serie)
  if (juste && temps >= 0.3 && (attente.eclair === undefined || temps < attente.eclair)) attente.eclair = Math.round(temps * 100) / 100
  garder()
  // Le combat se calme (dix secondes sans réponse) : le cumul part
  clearTimeout(minuterie)
  minuterie = window.setTimeout(() => void envoyer(), 10_000)
}

/** Les statistiques du joueur, ce qui n'est pas encore parti compris */
export function useStatistiques(): Statistiques | null | undefined {
  const [s, setS] = useState<Statistiques | null | undefined>(undefined)
  useEffect(() => {
    void envoyer().then(() => rpc<Statistiques>('mes_statistiques').then(setS))
  }, [])
  return s
}
