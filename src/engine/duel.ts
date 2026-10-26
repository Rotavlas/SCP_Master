import type { Base } from '../data/catalogue'
import type { Carte, Rarete } from '../types'
import type { Question } from './quiz'

export const INTEGRITE_MAX = 100
export const DUREE_QUESTION = 20
export const MANCHES = 5

export interface Adversaire {
  niveau: number
  nom: string
  titre: string
  /** Probabilité de bonne réponse sur une question facile */
  precision: number
  /** Répartition des raretés de son deck */
  poids: number[]
  /** Temps de réponse en secondes [min, max] */
  vitesse: [number, number]
  gain: number
  xp: number
  /** Accréditation requise pour l'affronter */
  accreditation: number
}

export const ADVERSAIRES: Adversaire[] = [
  { niveau: 1, nom: 'D-9341', titre: 'Personnel de Classe D', precision: 0.45, poids: [0.8, 0.2, 0, 0, 0], vitesse: [8, 18], gain: 40, xp: 40, accreditation: 0 },
  { niveau: 2, nom: 'Agent Lambert', titre: 'Force d\'intervention mobile Epsilon-11', precision: 0.6, poids: [0.45, 0.4, 0.15, 0, 0], vitesse: [6, 15], gain: 60, xp: 60, accreditation: 1 },
  { niveau: 3, nom: 'Dr Valois', titre: 'Chercheur principal, Site-19', precision: 0.72, poids: [0.15, 0.45, 0.3, 0.1, 0], vitesse: [5, 13], gain: 85, xp: 90, accreditation: 2 },
  { niveau: 4, nom: 'Directrice Okafor', titre: 'Directrice du Site-17', precision: 0.82, poids: [0, 0.3, 0.4, 0.25, 0.05], vitesse: [4, 11], gain: 120, xp: 130, accreditation: 3 },
  { niveau: 5, nom: 'O5-█', titre: 'Conseil O5', precision: 0.9, poids: [0, 0, 0.35, 0.45, 0.2], vitesse: [3, 9], gain: 180, xp: 200, accreditation: 4 },
]

export function deckAdversaire(base: Base, adversaire: Adversaire): Carte[] {
  const deck: Carte[] = []
  while (deck.length < MANCHES) {
    let x = Math.random()
    let rarete = 0
    while (rarete < 4 && (x -= adversaire.poids[rarete]) >= 0) rarete++
    const carte = base.auHasard(rarete as Rarete)
    if (!deck.some((c) => c.id === carte.id)) deck.push(carte)
  }
  return deck
}

/** Réponse simulée de l'adversaire : index choisi et temps mis. */
export function reponseAdversaire(adversaire: Adversaire, question: Question): { choix: number; temps: number } {
  const precision = Math.max(0.2, adversaire.precision - question.difficulte * 0.08)
  const [min, max] = adversaire.vitesse
  const temps = Math.min(DUREE_QUESTION - 0.5, min + Math.random() * (max - min))
  if (Math.random() < precision) return { choix: question.bonne, temps }
  const mauvaises = question.options.map((_, i) => i).filter((i) => i !== question.bonne)
  return { choix: mauvaises[Math.floor(Math.random() * mauvaises.length)], temps }
}

/**
 * Dégâts infligés quand on répond juste : la Menace de sa carte contre le Confinement
 * de la carte adverse, avec un bonus si l'on répond vite ou plus vite que l'adversaire.
 */
export function degats(attaquant: Carte, defenseur: Carte, temps: number, plusRapide: boolean): number {
  const base = attaquant.atk * 0.8 - defenseur.def * 0.32
  const vitesse = temps < DUREE_QUESTION / 3 ? 1.25 : 1
  const course = plusRapide ? 1.15 : 1
  return Math.max(8, Math.round(base * vitesse * course))
}
