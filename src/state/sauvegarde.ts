import { useSyncExternalStore } from 'react'
import { PRESTIGE, type IdVariante } from '../engine/variantes'
import type { Langue } from '../types'

export const DELAI_BOOSTER = 10 * 60 * 1000
export const STOCK_MAX = 10
export const TAILLE_DECK = 5

export interface Sauvegarde {
  version: number
  agent: string
  /** id de carte -> nombre d'exemplaires, toutes variantes confondues */
  collection: Record<string, number>
  /** id de carte -> exemplaires de chaque variante rare (la variante standard n'y figure pas) */
  variantes: Record<string, Partial<Record<IdVariante, number>>>
  /** exemplaires standard importés en « souvenir » (mode en ligne) : ni échangeables ni recyclables */
  souvenirs: Record<string, number>
  /** variante affichée quand on en possède plusieurs */
  affichage: Record<string, IdVariante>
  /** liste de souhaits : cartes recherchées, retirées dès qu'on les obtient */
  souhaits: string[]
  langue: Langue
  /** cartes obtenues mais pas encore consultées */
  nouvelles: string[]
  favoris: string[]
  deck: string[]
  credits: number
  xp: number
  boosters: number
  /** horodatage du dernier booster gratuit crédité */
  dernierBooster: number
  stats: { duels: number; victoires: number; boostersOuverts: number; bonnesReponses: number; questions: number }
  /** niveau d'adversaire le plus haut battu */
  meilleurAdversaire: number
}


function neuve(): Sauvegarde {
  return {
    version: 2,
    agent: '',
    collection: {},
    variantes: {},
    souvenirs: {},
    affichage: {},
    souhaits: [],
    langue: 'vo',
    nouvelles: [],
    favoris: [],
    deck: [],
    credits: 0,
    xp: 0,
    boosters: 0,
    dernierBooster: Date.now(),
    stats: { duels: 0, victoires: 0, boostersOuverts: 0, bonnesReponses: 0, questions: 0 },
    meilleurAdversaire: 0,
  }
}

/**
 * L'état du joueur connecté, recopié du serveur. Rien n'est enregistré dans le navigateur :
 * le serveur fait foi, ce store ne sert qu'à l'affichage et aux préférences.
 */
let etat = neuve()
const abonnes = new Set<() => void>()
const abonnesModifs = new Set<(avant: Sauvegarde, apres: Sauvegarde) => void>()

/** Ajoute les boosters gratuits accumulés depuis la dernière visite. */
function crediterBoosters(s: Sauvegarde): Sauvegarde {
  const maintenant = Date.now()
  if (s.boosters >= STOCK_MAX) return { ...s, dernierBooster: maintenant }
  const gagnes = Math.floor((maintenant - s.dernierBooster) / DELAI_BOOSTER)
  if (gagnes <= 0) return s
  const boosters = Math.min(STOCK_MAX, s.boosters + gagnes)
  return {
    ...s,
    boosters,
    dernierBooster: boosters >= STOCK_MAX ? maintenant : s.dernierBooster + gagnes * DELAI_BOOSTER,
  }
}

export function modifier(f: (s: Sauvegarde) => Sauvegarde) {
  const avant = etat
  etat = f(etat)
  abonnes.forEach((a) => a())
  abonnesModifs.forEach((a) => a(avant, etat))
}

/** Prévient à chaque modification (sert à synchroniser les préférences en ligne). */
export function surModification(f: (avant: Sauvegarde, apres: Sauvegarde) => void): () => void {
  abonnesModifs.add(f)
  return () => abonnesModifs.delete(f)
}

/** Remplace l'état par celui envoyé par le serveur. */
export function remplacer(s: Sauvegarde) {
  etat = s
  abonnes.forEach((a) => a())
}

/** Déconnexion : plus rien n'est affiché. */
export function vider() {
  remplacer(neuve())
}

export function rafraichirBoosters() {
  const suivant = crediterBoosters(etat)
  if (suivant !== etat) modifier(() => suivant)
}

export function obtenir(): Sauvegarde {
  return etat
}

export function useSauvegarde(): Sauvegarde {
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => etat,
  )
}

export function sauvegardeVide(): Sauvegarde {
  return neuve()
}

export function ajouterCartes(s: Sauvegarde, cartes: { id: string; variante?: IdVariante }[]): Sauvegarde {
  const collection = { ...s.collection }
  const variantes = { ...s.variantes }
  const nouvelles = new Set(s.nouvelles)
  const souhaits = new Set(s.souhaits)
  for (const { id, variante = 'std' } of cartes) {
    if (!collection[id]) nouvelles.add(id)
    collection[id] = (collection[id] ?? 0) + 1
    if (variante !== 'std') {
      variantes[id] = { ...variantes[id], [variante]: (variantes[id]?.[variante] ?? 0) + 1 }
    }
    souhaits.delete(id)
  }
  return { ...s, collection, variantes, nouvelles: [...nouvelles], souhaits: [...souhaits] }
}

/** Variante montrée dans les archives : celle choisie, sinon la plus prestigieuse possédée. */
export function varianteAffichee(s: Sauvegarde, id: string): IdVariante {
  const possedees = s.variantes[id] ?? {}
  const choisie = s.affichage[id]
  if (choisie && (choisie === 'std' ? exemplairesStandard(s, id) > 0 : possedees[choisie])) return choisie
  return PRESTIGE.find((v) => v !== 'std' && possedees[v]) ?? 'std'
}

/** Exemplaires standard (hors variantes rares) : seuls eux peuvent être recyclés. */
export function exemplairesStandard(s: Sauvegarde, id: string): number {
  const rares = Object.values(s.variantes[id] ?? {}).reduce((t, n) => t + (n ?? 0), 0)
  return (s.collection[id] ?? 0) - rares
}

/**
 * Doublons recyclables : les exemplaires standard, hors souvenirs importés,
 * en gardant toujours au moins un exemplaire de la carte. Même règle que prive.recycler() côté serveur.
 */
export function doublonsRecyclables(s: Sauvegarde, id: string): number {
  const recyclables = exemplairesStandard(s, id) - (s.souvenirs[id] ?? 0)
  const autres = (s.collection[id] ?? 0) - recyclables
  return Math.max(0, autres >= 1 ? recyclables : recyclables - 1)
}

export function recyclerDoublons(s: Sauvegarde, id: string): Sauvegarde {
  const n = doublonsRecyclables(s, id)
  if (!n) return s
  return { ...s, collection: { ...s.collection, [id]: s.collection[id] - n } }
}

// ---------- Notifications éphémères ----------

export interface Notification {
  id: number
  texte: string
  ton: 'info' | 'succes' | 'rare'
}

let notifications: Notification[] = []
const abonnesNotif = new Set<() => void>()

export function notifier(texte: string, ton: Notification['ton'] = 'info') {
  const n = { id: Date.now() + Math.random(), texte, ton }
  notifications = [...notifications, n].slice(-4)
  abonnesNotif.forEach((a) => a())
  setTimeout(() => {
    notifications = notifications.filter((x) => x.id !== n.id)
    abonnesNotif.forEach((a) => a())
  }, 4200)
}

export function useNotifications(): Notification[] {
  return useSyncExternalStore(
    (a) => {
      abonnesNotif.add(a)
      return () => abonnesNotif.delete(a)
    },
    () => notifications,
  )
}

/** Niveaux d'accréditation de la Fondation, débloqués par l'expérience. */
export const ACCREDITATIONS = [
  { niveau: 0, nom: 'Niveau 0 — Personnel non essentiel', xp: 0 },
  { niveau: 1, nom: 'Niveau 1 — Accès restreint', xp: 150 },
  { niveau: 2, nom: 'Niveau 2 — Accès confidentiel', xp: 500 },
  { niveau: 3, nom: 'Niveau 3 — Secret', xp: 1200 },
  { niveau: 4, nom: 'Niveau 4 — Top secret', xp: 2600 },
  { niveau: 5, nom: 'Niveau 5 — Thaumiel', xp: 5000 },
]

export function accreditation(xp: number) {
  let courant = ACCREDITATIONS[0]
  for (const a of ACCREDITATIONS) if (xp >= a.xp) courant = a
  const suivant = ACCREDITATIONS[courant.niveau + 1]
  return { ...courant, suivant }
}
