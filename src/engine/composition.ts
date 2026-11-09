/**
 * Composer une équipe : les cartes les plus fortes, en cherchant aussi les synergies (src/engine/synergies.ts).
 * Et, pour une équipe donnée, les échanges d'une carte qui ajouteraient une synergie (parmi les cartes possédées).
 * Tout se calcule sur l'appareil.
 */
import type { Carte } from '../types'
import { synergies, synergiesActives, type Synergie } from './synergies'

export const TAILLE_EQUIPE = 5
/** Ce que vaut une synergie face à la force brute des cartes (menace + confinement, de 60 à 200 environ) */
const VALEUR_TEMPS = 45
const VALEUR_EXCEPTION = 60

const force = (c: Carte) => c.atk + c.def

export function valeurEquipe(equipe: Carte[]): number {
  const actives = synergiesActives(equipe)
  return (
    equipe.reduce((s, c) => s + force(c), 0) +
    actives.filter((x) => x.effet === 'temps').length * VALEUR_TEMPS +
    (actives.some((x) => x.effet !== 'temps') ? VALEUR_EXCEPTION : 0)
  )
}

/** Les cartes qui ont un point commun avec au moins une autre carte : celles qui peuvent former une synergie */
function candidates(possedees: Carte[], limite: number): Carte[] {
  const numeros = new Set(possedees.filter((c) => c.num).map((c) => c.num!))
  const nombres = new Set(possedees.filter((c) => c.k === 's' && c.n !== undefined).map((c) => c.n!))
  const compte = new Map<string, number>()
  const cles = (c: Carte) => [
    ...(c.a ? [`a:${c.a}`] : []),
    ...(c.y ? [`y:${c.y}`] : []),
    ...(c.k === 's' && c.s ? [`s:${c.s}`] : []),
    ...(c.k === 's' && c.c ? [`c:${c.c}`] : []),
    ...(c.t ?? []).map((t) => `t:${t}`),
  ]
  for (const c of possedees) for (const k of cles(c)) compte.set(k, (compte.get(k) ?? 0) + 1)
  const prometteuse = (c: Carte) =>
    c.num === 'SCP-001' ||
    c.c === 'thaumiel' ||
    c.c === 'keter' ||
    c.k === 'g' ||
    (c.lie ?? []).some((n) => numeros.has(n)) ||
    (c.k === 's' && c.n !== undefined && (nombres.has(c.n - 1) || nombres.has(c.n + 1))) ||
    cles(c).some((k) => (compte.get(k) ?? 0) >= 2)
  const fortes = [...possedees].sort((a, b) => force(b) - force(a))
  const choisies = new Set(fortes.slice(0, 30))
  for (const c of fortes) {
    if (choisies.size >= limite) break
    if (prometteuse(c)) choisies.add(c)
  }
  return [...choisies]
}

/** La meilleure équipe trouvée : on part des plus fortes, puis on échange une carte tant que l'équipe y gagne */
export function composerEquipe(possedees: Carte[]): Carte[] {
  const uniques = [...new Map(possedees.map((c) => [c.id, c])).values()]
  if (uniques.length <= TAILLE_EQUIPE) return uniques
  const pool = candidates(uniques, 90)
  let equipe = [...pool].sort((a, b) => force(b) - force(a)).slice(0, TAILLE_EQUIPE)
  let valeur = valeurEquipe(equipe)
  for (let tour = 0; tour < 25; tour++) {
    let mieux: { equipe: Carte[]; valeur: number } | null = null
    for (let i = 0; i < equipe.length; i++)
      for (const c of pool) {
        if (equipe.includes(c)) continue
        const essai = equipe.map((x, j) => (j === i ? c : x))
        const v = valeurEquipe(essai)
        if (v > (mieux?.valeur ?? valeur)) mieux = { equipe: essai, valeur: v }
      }
    if (!mieux) break
    equipe = mieux.equipe
    valeur = mieux.valeur
  }
  return equipe
}

export interface Suggestion {
  retirer: Carte
  ajouter: Carte
  /** Les synergies que l'échange fait apparaître, et celles qu'il fait perdre */
  gagne: Synergie[]
  perd: Synergie[]
}

/** Les échanges d'une seule carte qui ajoutent une synergie qui compte, sans en perdre (les meilleurs d'abord) */
export function suggestionsSynergies(equipe: Carte[], possedees: Carte[], max = 3): Suggestion[] {
  if (equipe.length < TAILLE_EQUIPE) return []
  const actives = synergiesActives(equipe)
  const ids = new Set(actives.map((s) => s.id))
  const avant = valeurEquipe(equipe)
  const dansEquipe = new Set(equipe.map((c) => c.id))
  const pool = candidates(
    possedees.filter((c) => !dansEquipe.has(c.id)),
    300,
  )
  const res: (Suggestion & { valeur: number })[] = []
  for (const ajouter of pool)
    for (let i = 0; i < equipe.length; i++) {
      const essai = equipe.map((x, j) => (j === i ? ajouter : x))
      const apres = synergiesActives(essai)
      const gagne = apres.filter((s) => !ids.has(s.id))
      if (!gagne.length || apres.length < actives.length) continue
      const valeur = valeurEquipe(essai) - avant
      if (valeur <= 0) continue
      const restent = new Set(apres.map((s) => s.id))
      res.push({ retirer: equipe[i], ajouter, gagne, perd: actives.filter((s) => !restent.has(s.id)), valeur })
    }
  // Une seule suggestion par synergie gagnée, la plus avantageuse
  const vues = new Set<string>()
  return res
    .sort((a, b) => b.valeur - a.valeur)
    .filter((s) => {
      const k = s.gagne.map((g) => g.id).join()
      if (vues.has(k)) return false
      vues.add(k)
      return true
    })
    .slice(0, max)
    .map(({ retirer, ajouter, gagne, perd }) => ({ retirer, ajouter, gagne, perd }))
}

export { synergies }
