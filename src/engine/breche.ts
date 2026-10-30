/**
 * La « Brèche de confinement » : les règles des confrontations contre l'IA, partagées entre le serveur
 * (serveur/breche.ts, qui arbitre) et l'écran (qui affiche les rôles et les effets prévus).
 *
 * Chaque camp protège un Site de 3 cellules. À chaque tour, les deux camps engagent une carte de leur main
 * de 5 ; son rôle dépend de son type : les SCP (et les GdI, contes, canons, documents) tentent une brèche dans
 * une cellule adverse, les FIM et le personnel gardent une des leurs, les Sites ajoutent une cellule, les
 * Protocoles affaiblissent l'action adverse. La question porte sur sa propre carte : juste, la carte agit
 * pleinement ; fausse ou hors délai, à moitié. Juste et rapide, on prend l'initiative : au tour suivant, on
 * voit la carte adverse avant de choisir. On gagne en faisant tomber toutes les cellules adverses, ou avec
 * plus d'intégrité au bout des 5 tours.
 */
import type { Carte, Classe } from '../types'

export const TOURS = 5
export const CELLULES = 3
export const CELLULES_MAX = 4
export const INTEGRITE_CELLULE = 80
/** Une bonne réponse en moins de 7 s donne l'initiative au tour suivant */
export const SEUIL_INITIATIVE = 7

export type Role = 'attaque' | 'defense' | 'fortification' | 'protocole'

export const ROLES: Record<Role, { nom: string; verbe: string; aide: string; cible: 'adverse' | 'alliee' | null }> = {
  attaque: {
    nom: 'Brèche',
    verbe: 'tente une brèche',
    aide: 'Frappe une cellule adverse avec sa Menace ; une classe dangereuse frappe plus fort.',
    cible: 'adverse',
  },
  defense: {
    nom: 'Garde',
    verbe: 'garde',
    aide: 'Protège une de vos cellules avec son Confinement. Une FIM riposte, le personnel répare.',
    cible: 'alliee',
  },
  fortification: { nom: 'Fortification', verbe: 'fortifie le Site', aide: 'Ouvre une nouvelle cellule, ou répare la plus abîmée.', cible: null },
  protocole: { nom: 'Protocole', verbe: 'déclenche', aide: 'Affaiblit de moitié la carte adverse de ce tour, quel que soit son rôle.', cible: null },
}

export function role(c: Pick<Carte, 'k'> & Partial<Pick<Carte, 'id'>>): Role {
  // Les grandes entités (Roi écarlate, Serpent…) sont des menaces, pas du personnel
  if (c.id?.startsWith('entite:')) return 'attaque'
  switch (c.k) {
    case 'f':
    case 'p':
    case 'e':
      return 'defense'
    case 'l':
      return 'fortification'
    case 'o':
      return 'protocole'
    default:
      return 'attaque'
  }
}

/** Force d'une brèche selon la classe : un Keter frappe plus fort qu'un Safe */
const FORCE_CLASSE: Partial<Record<Classe, number>> = { safe: 0.9, keter: 1.2, apollyon: 1.4, thaumiel: 1.05 }
export const forceClasse = (c: Pick<Carte, 'c'>) => (c.c ? (FORCE_CLASSE[c.c] ?? 1) : 1)

/** Une Mythique est l'ultime de sa main : une fois par partie, elle agit une fois et demie et ignore les gardes */
export const estUltime = (c: Pick<Carte, 'ra'>) => c.ra === 5

/** Une FIM a confiné ce SCP dans le wiki (ses liens sont des désignations : « SCP-173 ») */
export const aConfine = (fim: Pick<Carte, 'k' | 'lie'>, scp: Pick<Carte, 'num'>) => fim.k === 'f' && !!scp.num && !!fim.lie?.includes(scp.num)

export interface Camp {
  /** Intégrité de chaque cellule (0 : tombée) */
  cellules: number[]
  /** L'ultime a déjà servi */
  ultime: boolean
}

export const campNeuf = (): Camp => ({ cellules: Array(CELLULES).fill(INTEGRITE_CELLULE), ultime: false })
export const integrite = (c: Camp) => c.cellules.reduce((s, x) => s + x, 0)
export const tombe = (c: Camp) => c.cellules.every((x) => x <= 0)

/** La cellule debout la plus abîmée (ou -1) */
export function plusFaible(c: Camp): number {
  let i = -1
  c.cellules.forEach((x, j) => {
    if (x > 0 && (i < 0 || x < c.cellules[i])) i = j
  })
  return i
}

export interface Coup {
  carte: Carte
  /** Cellule visée : adverse pour une brèche, alliée pour une garde ; ignorée sinon */
  cible: number
  juste: boolean
}

/** Ce qui s'est passé pendant le tour, pour l'affichage */
export interface Evenement {
  /** Camp qui agit */
  camp: 'joueur' | 'ia'
  type: 'breche' | 'garde' | 'riposte' | 'reparation' | 'reconfinement' | 'cellule' | 'protocole' | 'ultime'
  /** Cellule touchée ou renforcée, dans le camp concerné par l'effet */
  cellule?: number
  valeur?: number
  texte: string
}

/** Puissance d'une carte une fois la question passée */
const justesse = (coup: Coup) => (coup.juste ? 1 : 0.5)

/** Effet prévu d'une carte, avant la question (pour l'affichage) : le plein effet si l'on répond juste */
export function effetPrevu(c: Carte, ultimeDispo: boolean): number {
  const ultime = ultimeDispo && estUltime(c) ? 1.5 : 1
  switch (role(c)) {
    case 'attaque':
      return Math.round(c.atk * forceClasse(c) * ultime)
    case 'defense':
      return Math.round(c.def * ultime)
    case 'fortification':
      return Math.round(c.def * 0.6)
    case 'protocole':
      return 50
  }
}

const nom = (c: Carte) => c.num ?? c.nm

/**
 * Résout un tour : les deux coups agissent en même temps. Ordre : protocoles, gardes, brèches (et ripostes),
 * réparations, nouvelles cellules. Ne modifie pas les camps reçus.
 */
export function resoudre(joueur: Camp, ia: Camp, coupJoueur: Coup, coupIA: Coup): { joueur: Camp; ia: Camp; evenements: Evenement[] } {
  const camps = { joueur: { ...joueur, cellules: [...joueur.cellules] }, ia: { ...ia, cellules: [...ia.cellules] } }
  const coups = { joueur: coupJoueur, ia: coupIA }
  const evenements: Evenement[] = []
  const autre = (x: 'joueur' | 'ia') => (x === 'joueur' ? 'ia' : 'joueur')
  const ordre = ['joueur', 'ia'] as const

  // Ultime : la première Mythique de chaque camp
  const ultime = { joueur: false, ia: false }
  for (const x of ordre) {
    if (estUltime(coups[x].carte) && !camps[x].ultime) {
      ultime[x] = true
      camps[x].ultime = true
      evenements.push({ camp: x, type: 'ultime', texte: `${nom(coups[x].carte)} : ultime déclenché` })
    }
  }

  // Facteur de chaque coup : justesse, ultime, et protocole adverse
  const facteur = { joueur: justesse(coupJoueur) * (ultime.joueur ? 1.5 : 1), ia: justesse(coupIA) * (ultime.ia ? 1.5 : 1) }
  for (const x of ordre) {
    if (role(coups[x].carte) !== 'protocole') continue
    const affaiblissement = coups[x].juste ? 0.5 : 0.75
    facteur[autre(x)] *= affaiblissement
    evenements.push({
      camp: x,
      type: 'protocole',
      texte: `${nom(coups[x].carte)} affaiblit ${nom(coups[autre(x)].carte)} (×${affaiblissement})`,
    })
  }

  // Gardes
  const garde = { joueur: new Map<number, number>(), ia: new Map<number, number>() }
  for (const x of ordre) {
    const c = coups[x]
    if (role(c.carte) !== 'defense') continue
    const valeur = Math.round(c.carte.def * facteur[x])
    // L'ultime d'un défenseur garde toutes les cellules
    const cellules = ultime[x] ? camps[x].cellules.map((_, i) => i) : [cible(camps[x], c.cible)]
    for (const i of cellules) if (i >= 0) garde[x].set(i, valeur)
    if (cellules[0] >= 0) {
      evenements.push({
        camp: x,
        type: 'garde',
        cellule: ultime[x] ? undefined : cellules[0],
        valeur,
        texte: `${nom(c.carte)} garde ${ultime[x] ? 'toutes les cellules' : `la cellule ${cellules[0] + 1}`} (${valeur})`,
      })
    }
  }

  // Brèches, simultanées : les dégâts se calculent avant d'être appliqués
  const degats: { camp: 'joueur' | 'ia'; cellule: number; valeur: number }[] = []
  for (const x of ordre) {
    const c = coups[x]
    if (role(c.carte) !== 'attaque') continue
    const y = autre(x)
    const i = cible(camps[y], c.cible)
    if (i < 0) continue
    const brut = Math.round(c.carte.atk * forceClasse(c.carte) * facteur[x])
    const defenseur = coups[y]
    // Une FIM qui garde la cellule visée par un SCP qu'elle a confiné dans le wiki le reconfine aussitôt
    if (role(defenseur.carte) === 'defense' && garde[y].has(i) && aConfine(defenseur.carte, c.carte)) {
      evenements.push({ camp: y, type: 'reconfinement', cellule: i, texte: `${nom(defenseur.carte)} reconnaît ${nom(c.carte)} et le reconfine` })
      continue
    }
    const bouclier = ultime[x] ? 0 : (garde[y].get(i) ?? 0)
    const valeur = Math.max(0, brut - bouclier)
    degats.push({ camp: y, cellule: i, valeur })
    evenements.push({
      camp: x,
      type: 'breche',
      cellule: i,
      valeur,
      texte: bouclier
        ? `${nom(c.carte)} frappe la cellule ${i + 1} : ${brut} − ${bouclier} gardés = ${valeur}`
        : `${nom(c.carte)} frappe la cellule ${i + 1} : ${valeur}`,
    })
    // Riposte d'une FIM : ce que sa garde n'a pas eu à absorber repart, à moitié, sur la cellule d'en face
    if (role(defenseur.carte) === 'defense' && defenseur.carte.k === 'f' && bouclier > brut) {
      const j = cible(camps[x], i)
      const riposte = Math.round((bouclier - brut) * 0.5)
      if (j >= 0 && riposte > 0) {
        degats.push({ camp: x, cellule: j, valeur: riposte })
        evenements.push({
          camp: y,
          type: 'riposte',
          cellule: j,
          valeur: riposte,
          texte: `${nom(defenseur.carte)} riposte sur la cellule ${j + 1} : ${riposte}`,
        })
      }
    }
  }
  for (const d of degats) camps[d.camp].cellules[d.cellule] = Math.max(0, camps[d.camp].cellules[d.cellule] - d.valeur)

  // Réparations : le personnel répare la cellule qu'il garde, un Thaumiel la plus abîmée de son camp
  for (const x of ordre) {
    const c = coups[x]
    const soin =
      role(c.carte) === 'defense' && c.carte.k !== 'f'
        ? { i: cible(camps[x], c.cible), v: Math.round(c.carte.def * 0.25 * facteur[x]) }
        : role(c.carte) === 'attaque' && c.carte.c === 'thaumiel'
          ? { i: plusFaible(camps[x]), v: Math.round(15 * facteur[x]) }
          : null
    if (!soin || soin.i < 0 || camps[x].cellules[soin.i] <= 0) continue
    const avant = camps[x].cellules[soin.i]
    camps[x].cellules[soin.i] = Math.min(INTEGRITE_CELLULE, avant + soin.v)
    const v = camps[x].cellules[soin.i] - avant
    if (v > 0) evenements.push({ camp: x, type: 'reparation', cellule: soin.i, valeur: v, texte: `${nom(c.carte)} répare la cellule ${soin.i + 1} : +${v}` })
  }

  // Fortification : un Site ouvre une cellule de plus (4 au maximum), sinon répare la plus abîmée
  for (const x of ordre) {
    const c = coups[x]
    if (role(c.carte) !== 'fortification' || tombe(camps[x])) continue
    const v = Math.round(c.carte.def * 0.6 * facteur[x])
    if (camps[x].cellules.length < CELLULES_MAX) {
      camps[x].cellules.push(Math.min(INTEGRITE_CELLULE, v))
      const i = camps[x].cellules.length - 1
      evenements.push({
        camp: x,
        type: 'cellule',
        cellule: i,
        valeur: camps[x].cellules[i],
        texte: `${nom(c.carte)} ouvre la cellule ${i + 1} (${camps[x].cellules[i]})`,
      })
    } else {
      const i = plusFaible(camps[x])
      const avant = camps[x].cellules[i]
      camps[x].cellules[i] = Math.min(INTEGRITE_CELLULE, avant + v)
      evenements.push({
        camp: x,
        type: 'reparation',
        cellule: i,
        valeur: camps[x].cellules[i] - avant,
        texte: `${nom(c.carte)} répare la cellule ${i + 1} : +${camps[x].cellules[i] - avant}`,
      })
    }
  }

  return { ...camps, evenements }
}

/** La cellule visée si elle tient encore, sinon la plus abîmée de celles qui tiennent */
function cible(camp: Camp, i: number): number {
  return Number.isInteger(i) && camp.cellules[i] > 0 ? i : plusFaible(camp)
}

/** Initiative du tour suivant : bonne réponse en moins de 7 s, et la plus rapide si les deux le sont */
export function initiative(joueur: { juste: boolean; temps: number }, ia: { juste: boolean; temps: number }): 'joueur' | 'ia' | null {
  const j = joueur.juste && joueur.temps <= SEUIL_INITIATIVE
  const a = ia.juste && ia.temps <= SEUIL_INITIATIVE
  if (j && a) return joueur.temps <= ia.temps ? 'joueur' : 'ia'
  return j ? 'joueur' : a ? 'ia' : null
}

export type Issue = 'victoire' | 'defaite' | 'nul'

export function issue(joueur: Camp, ia: Camp): Issue {
  if (tombe(ia) && !tombe(joueur)) return 'victoire'
  if (tombe(joueur) && !tombe(ia)) return 'defaite'
  const d = integrite(joueur) - integrite(ia)
  return d > 0 ? 'victoire' : d < 0 ? 'defaite' : 'nul'
}

export const terminee = (tour: number, joueur: Camp, ia: Camp) => tour >= TOURS || tombe(joueur) || tombe(ia)

/**
 * Le choix de l'IA : sa carte et sa cible. `vu` est le coup du joueur quand l'IA a l'initiative (elle choisit en
 * le voyant) ; `finesse` (0 à 1) la fait jouer plus ou moins au mieux.
 */
export function choisirIA(
  main: Carte[],
  campIA: Camp,
  campJoueur: Camp,
  vu: { carte: Carte; cible: number } | null,
  finesse: number,
  hasard: () => number = Math.random,
): { carte: Carte; cible: number } {
  const options = main.map((carte) => {
    const r = role(carte)
    let cibleChoisie = 0
    let valeur = 0
    if (r === 'attaque') {
      cibleChoisie = plusFaible(campJoueur)
      valeur = carte.atk * forceClasse(carte)
      // Une cellule qu'elle peut faire tomber vaut plus
      if (campJoueur.cellules[cibleChoisie] <= valeur) valeur += 25
      if (vu && role(vu.carte) === 'defense') {
        // Elle évite la cellule gardée
        const libres = campJoueur.cellules.map((x, i) => (x > 0 && i !== vu.cible ? i : -1)).filter((i) => i >= 0)
        if (libres.length) cibleChoisie = libres.reduce((a, b) => (campJoueur.cellules[b] < campJoueur.cellules[a] ? b : a))
      }
    } else if (r === 'defense') {
      cibleChoisie = vu && role(vu.carte) === 'attaque' ? cible(campIA, vu.cible) : plusFaible(campIA)
      valeur = carte.def * (vu ? (role(vu.carte) === 'attaque' ? 1.6 : 0.3) : 0.8)
      if (vu && aConfine(carte, vu.carte)) valeur += 100
    } else if (r === 'fortification') {
      valeur = campIA.cellules.length < CELLULES_MAX || campIA.cellules.some((x) => x < INTEGRITE_CELLULE / 2) ? carte.def * 0.9 : 10
    } else {
      valeur = vu ? (role(vu.carte) === 'attaque' ? vu.carte.atk * 0.8 : 15) : 35
    }
    if (estUltime(carte) && !campIA.ultime) valeur *= 1.5
    // Moins de finesse : un choix plus hasardeux
    valeur *= 1 - (1 - finesse) * hasard()
    return { carte, cible: cibleChoisie, valeur }
  })
  options.sort((a, b) => b.valeur - a.valeur)
  return { carte: options[0].carte, cible: Math.max(0, options[0].cible) }
}
