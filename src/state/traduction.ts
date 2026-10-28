/**
 * Traduction automatique des cartes que la branche française n'a pas traduites, par le traducteur
 * intégré au navigateur (API Translator de Chrome) : il tourne sur l'appareil, rien n'est envoyé
 * à un serveur. Une traduction officielle (carte.vf) a toujours la priorité ; sans traducteur, la VO reste.
 * Les traductions sont gardées en mémoire et dans le navigateur, et ne servent qu'à l'affichage
 * (le quiz des duels reste sur les textes du wiki).
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { Carte } from '../types'
import { useSauvegarde } from './sauvegarde'

interface Traducteur {
  translate(texte: string): Promise<string>
}
interface ApiTraducteur {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<Traducteur>
}

type Champs = Pick<Carte, 'nm' | 'x' | 'q'>

const api = (globalThis as unknown as { Translator?: ApiTraducteur }).Translator
const LANGUES = { sourceLanguage: 'en', targetLanguage: 'fr' }
const CLE = 'scp-masters:trad-auto:'

let traducteur: Promise<Traducteur | null> | null = null
const connues = new Map<string, Champs>()
const enCours = new Set<string>()
const abonnes = new Set<() => void>()
let file: Promise<unknown> = Promise.resolve()
// Cartes demandées avant que le traducteur soit prêt, et échec d'une création sans geste de l'utilisateur
const enAttente = new Map<string, Carte>()
let echecSansGeste = false

/** Le navigateur sait-il traduire ? (Chrome récent, sur ordinateur) */
export const traductionAutoPossible = () => !!api

/**
 * Prépare le traducteur. À appeler depuis un clic (passage en VF) : le premier téléchargement
 * du modèle de langue exige un geste de l'utilisateur.
 */
export function preparerTraducteur(geste = false) {
  if (!api || traducteur || (!geste && echecSansGeste)) return
  // Un traducteur qui ne répond pas (modèle en attente) ne doit jamais bloquer l'affichage : la VO reste
  const delai = new Promise<null>((ok) => setTimeout(() => ok(null), 20_000))
  traducteur = Promise.race([
    api
      .availability(LANGUES)
      .then((etat) => (etat === 'unavailable' ? null : api.create(LANGUES)))
      .catch(() => null),
    delai,
  ])
  void traducteur.then((t) => {
    if (!t) {
      // Échec (modèle à télécharger sans geste, ou indisponible) : on réessaiera au prochain clic sur VF
      traducteur = null
      echecSansGeste = !geste
      return
    }
    const cartes = [...enAttente.values()]
    enAttente.clear()
    cartes.forEach(demander)
  })
}

function lire(id: string): Champs | undefined {
  const memoire = connues.get(id)
  if (memoire) return memoire
  try {
    const brut = localStorage.getItem(CLE + id)
    if (brut) {
      const champs = JSON.parse(brut) as Champs
      connues.set(id, champs)
      return champs
    }
  } catch {
    // Stockage du navigateur indisponible : la mémoire suffit
  }
  return undefined
}

function garder(id: string, champs: Champs) {
  connues.set(id, champs)
  try {
    localStorage.setItem(CLE + id, JSON.stringify(champs))
  } catch {
    // Stockage plein : on repart de zéro plutôt que de bloquer
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith(CLE)) localStorage.removeItem(k)
    } catch {
      // ignoré
    }
  }
  abonnes.forEach((a) => a())
}

function demander(carte: Carte) {
  if (enCours.has(carte.id)) return
  if (!traducteur) {
    enAttente.set(carte.id, carte)
    return
  }
  enCours.add(carte.id)
  const t = traducteur
  // Une carte à la fois : le modèle tourne sur l'appareil
  file = file.then(async () => {
    const tr = await t
    if (!tr) return
    try {
      const [nm, x, q] = await Promise.all([
        // Un surnom entre crochets ([DONNÉES EXPURGÉES]…) ou une désignation seule ne se traduit pas
        /^\[.*\]$/.test(carte.nm) || carte.nm === carte.num ? carte.nm : tr.translate(carte.nm),
        carte.x ? tr.translate(carte.x) : undefined,
        carte.q ? tr.translate(carte.q) : undefined,
      ])
      garder(carte.id, { nm, x, q })
    } catch {
      // Traduction refusée pour cette carte : elle reste en VO
    } finally {
      enCours.delete(carte.id)
    }
  })
}

/**
 * La carte telle qu'elle s'affiche : en VF, la traduction officielle si elle existe, sinon la traduction
 * automatique (marquée `auto`) dès qu'elle est prête, la VO en attendant.
 */
export function useCarteAffichee(carte: Carte): Carte & { auto?: boolean } {
  const vf = useSauvegarde().langue === 'vf'
  const besoin = vf && !carte.vf && !!api
  const champs = useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => (besoin ? lire(carte.id) : undefined),
  )
  useEffect(() => {
    if (!besoin || champs) return
    preparerTraducteur()
    demander(carte)
  }, [besoin, champs, carte])
  return champs ? { ...carte, ...champs, auto: true } : carte
}
