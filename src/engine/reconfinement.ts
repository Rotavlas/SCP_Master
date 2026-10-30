/**
 * Le Reconfinement : les règles, partagées entre le serveur (serveur/reconfinement.ts) et l'écran.
 *
 * Chaque tour, les deux agents jouent une carte de leur main. Une anomalie (SCP, grande entité, Groupe d'intérêt,
 * conte…) est libérée chez l'adversaire et déclenche son effet (src/engine/effets.ts) ; pour la stopper,
 * l'adversaire doit la reconfiner en répondant à une question sur elle. Une carte de soutien (FIM, personnel,
 * Site, Protocole) aide plutôt à reconfiner ce qui arrive en face. Les bonnes réponses remplissent la jauge de
 * Manifestation : pleine, elle libère la Mythique de l'équipe, sa cinématique et son pouvoir.
 */
import type { Carte } from '../types'
import { DUREE_TEMPORELLE, effetDe, type Effet } from './effets'

export const TOURS_RECO = 5
export const INTEGRITE_SITE = 100
export const MANIFESTATION_MAX = 100
export const DUREE_RECO = 20
/** Une bonne réponse en moins de 7 s remplit davantage la jauge */
export const SEUIL_RAPIDE = 7

export type Nature = 'anomalie' | 'soutien'

export const nature = (c: Pick<Carte, 'k' | 'id'>): Nature => (c.id.startsWith('entite:') || ['s', 'g', 'c', 'n', 'd'].includes(c.k) ? 'anomalie' : 'soutien')

export type Soutien = 'fim' | 'personnel' | 'site' | 'protocole'

export function soutien(c: Pick<Carte, 'k'>): Soutien {
  return c.k === 'f' ? 'fim' : c.k === 'l' ? 'site' : c.k === 'o' ? 'protocole' : 'personnel'
}

export const SOUTIENS: Record<Soutien, { nom: string; texte: string }> = {
  fim: {
    nom: 'Équipe d’intervention',
    texte: 'Retire une mauvaise réponse (deux si Épique ou mieux), et reconfine d’office un SCP qu’elle a confiné dans le wiki.',
  },
  personnel: { nom: 'Expertise', texte: 'Donne 8 secondes de plus et dissipe l’effet de l’anomalie sur la question.' },
  site: { nom: 'Renforts', texte: 'Le Site regagne des points selon son Confinement.' },
  protocole: { nom: 'Protocole', texte: 'Neutralise l’effet de l’anomalie qui arrive et divise sa brèche par deux.' },
}

export interface CampReco {
  integrite: number
  manifestation: number
  /** Dégâts subis à chaque fin de tour (contagion) */
  poison: number
  /** La Manifestation a déjà servi */
  manifeste: boolean
  /** Reconfinements réussis d'office (Main droite rouge, Veto) */
  reconfinementsAuto: number
  /** Questions réduites à 8 s (Clignement de SCP-173) */
  questionsCourtes: number
  /** Reconfinements ratés d'office (Effacement de SCP-2747) */
  echecsAuto: number
  /** Questions réduites à deux réponses (Révélation de Siegel) */
  questionsFaciles: number
}

export const campReco = (): CampReco => ({
  integrite: INTEGRITE_SITE,
  manifestation: 0,
  poison: 0,
  manifeste: false,
  reconfinementsAuto: 0,
  questionsCourtes: 0,
  echecsAuto: 0,
  questionsFaciles: 0,
})

/** Une FIM a confiné ce SCP dans le wiki (ses liens sont des désignations : « SCP-173 ») */
export const aConfine = (fim: Pick<Carte, 'k' | 'lie'>, a: Pick<Carte, 'num'>) => fim.k === 'f' && !!a.num && !!fim.lie?.includes(a.num)

/**
 * Comment se présente le reconfinement d'une anomalie pour celui qui la reçoit : effet actif (sauf Protocole ou
 * expertise), durée, réponses retirées, reconfinement ou échec d'office.
 */
export interface Reconfinement {
  effet: Effet
  /** L'effet joue sur la question (pas dissipé) */
  alteree: boolean
  /** L'effet joue sur la brèche (pas neutralisé par un Protocole) */
  actif: boolean
  duree: number
  /** Nombre de mauvaises réponses retirées */
  retirees: number
  auto: 'reussite' | 'echec' | null
  /** Facteur de la brèche (Protocole : moitié) */
  attenuation: number
}

export function preparerReconfinement(anomalie: Carte, defenseur: CampReco, soutienDefenseur: Carte | null): Reconfinement {
  const effet = effetDe(anomalie)
  const s = soutienDefenseur && nature(soutienDefenseur) === 'soutien' ? soutien(soutienDefenseur) : null
  const neutralise = s === 'protocole'
  const dissipe = neutralise || s === 'personnel'
  let duree = DUREE_RECO
  if (effet.alteration === 'temporel' && !dissipe) duree = DUREE_TEMPORELLE
  if (defenseur.questionsCourtes > 0) duree = 8
  if (s === 'personnel') duree += 8
  const retirees = Math.min(2, (s === 'fim' ? (soutienDefenseur!.ra >= 3 ? 2 : 1) : 0) + (defenseur.questionsFaciles > 0 ? 2 : 0))
  const auto =
    defenseur.reconfinementsAuto > 0 || (s === 'fim' && aConfine(soutienDefenseur!, anomalie)) ? 'reussite' : defenseur.echecsAuto > 0 ? 'echec' : null
  return { effet, alteree: !dissipe && !!effet.alteration, actif: !neutralise, duree, retirees, auto, attenuation: neutralise ? 0.5 : 1 }
}

export interface Issue {
  /** L'anomalie est reconfinée */
  reconfinee: boolean
  /** Temps de réponse, en secondes */
  temps: number
  /** SCP-096 : le défenseur a regardé son visage */
  regarde?: boolean
}

export interface Evenement {
  /** Le camp concerné par l'effet */
  camp: 'joueur' | 'ia'
  type: 'breche' | 'reconfinement' | 'poison' | 'soin' | 'poche' | 'manifestation' | 'jauge'
  valeur?: number
  texte: string
}

export const DEGATS_BASE = 0.5

/** Dégâts d'une anomalie qui fait brèche, ou de ce qu'elle inflige malgré tout une fois reconfinée */
export function degatsAnomalie(a: Carte, r: Reconfinement, issue: Issue): number {
  const e = r.effet
  if (r.actif && e.special === 'inoffensif') return 0
  let d = a.atk * DEGATS_BASE * r.attenuation
  if (r.actif) {
    d *= e.force ?? 1
    // SCP-173 : chaque seconde passée les yeux ouverts compte
    if (e.special === 'lent') d *= 0.6 + Math.min(issue.temps, DUREE_RECO) / DUREE_RECO
    if (e.special === 'visage' && issue.regarde && !issue.reconfinee) d *= 3
  }
  if (issue.reconfinee) d *= r.actif ? (e.tenace ?? 0) : 0
  return Math.round(d)
}

const nom = (c: Carte) => c.num ?? c.nm

/**
 * Applique la libération d'une anomalie de `auteur` chez `cible` (camps modifiés en place) ; renvoie les cartes
 * à retirer de la main de la cible (dimension de poche).
 */
export function appliquerLiberation(
  auteur: 'joueur' | 'ia',
  camps: Record<'joueur' | 'ia', CampReco>,
  anomalie: Carte,
  r: Reconfinement,
  issue: Issue,
  evenements: Evenement[],
): { poche: boolean } {
  const cible = auteur === 'joueur' ? 'ia' : 'joueur'
  const e = r.effet
  const d = degatsAnomalie(anomalie, r, issue)
  if (issue.reconfinee) {
    evenements.push({
      camp: cible,
      type: 'reconfinement',
      valeur: d,
      texte: d ? `${nom(anomalie)} est reconfiné, mais inflige ${d}` : `${nom(anomalie)} est reconfiné`,
    })
  } else if (d > 0 || !(r.actif && e.special === 'inoffensif')) {
    evenements.push({ camp: cible, type: 'breche', valeur: d, texte: `${nom(anomalie)} fait brèche : ${d}` })
  }
  camps[cible].integrite = Math.max(0, camps[cible].integrite - d)
  let poche = false
  if (r.actif && !issue.reconfinee) {
    if (e.poison) {
      camps[cible].poison += e.poison
      evenements.push({ camp: cible, type: 'poison', valeur: e.poison, texte: `Contamination : ${e.poison} par tour` })
    }
    if (e.special === 'remede' || e.special === 'inoffensif') {
      const soin = e.special === 'remede' ? 15 : 20
      camps[auteur].integrite = Math.min(INTEGRITE_SITE, camps[auteur].integrite + soin)
      evenements.push({ camp: auteur, type: 'soin', valeur: soin, texte: `${nom(anomalie)} : +${soin}` })
    }
    if (e.special === 'poche') {
      poche = true
      evenements.push({ camp: cible, type: 'poche', texte: `${nom(anomalie)} emporte une carte dans sa dimension de poche` })
    }
  }
  // Une anomalie qui fait brèche nourrit la jauge de son camp
  if (!issue.reconfinee) remplir(camps[auteur], 15)
  return { poche }
}

/** Une bonne réponse remplit la jauge, davantage si elle est rapide */
export function gainReponse(juste: boolean, temps: number): number {
  return juste ? (temps <= SEUIL_RAPIDE ? 35 : 25) : 0
}

export function remplir(camp: CampReco, n: number) {
  if (!camp.manifeste) camp.manifestation = Math.min(MANIFESTATION_MAX, camp.manifestation + n)
}

export const termine = (tour: number, joueur: CampReco, ia: CampReco) => tour >= TOURS_RECO || joueur.integrite <= 0 || ia.integrite <= 0

export function issueReco(joueur: CampReco, ia: CampReco): 'victoire' | 'defaite' | 'nul' {
  if (joueur.integrite <= 0 && ia.integrite > 0) return 'defaite'
  if (ia.integrite <= 0 && joueur.integrite > 0) return 'victoire'
  return joueur.integrite > ia.integrite ? 'victoire' : joueur.integrite < ia.integrite ? 'defaite' : 'nul'
}

// ---------- Manifestation : le pouvoir de la Mythique de l'équipe ----------

export interface Manifestation {
  id: string
  nom: string
  texte: string
  /** Carte dont la cinématique se joue (absente : Protocole d'urgence) */
  carte?: string
}

export const URGENCE: Manifestation = { id: 'urgence', nom: 'Protocole d’urgence O5', texte: 'Le Conseil intervient : votre Site regagne 20 points.' }

const MANIFESTATIONS: Record<string, Omit<Manifestation, 'carte'>> = {
  'entite:scarlet-king': { id: 'chaines', nom: 'Les chaînes du Roi', texte: 'Deux cartes de la main adverse sont enchaînées jusqu’à la fin de la partie.' },
  'dr-clef-s-proposal': { id: 'patmos', nom: 'Procédure Patmos-Omega', texte: 'Le Site adverse perd 30 points et sa jauge retombe à zéro.' },
  'fim:alpha-1': { id: 'main-rouge', nom: 'La Main droite rouge', texte: 'Vos deux prochains reconfinements réussissent d’office.' },
  'perso:the-administrator': { id: 'reecriture', nom: 'Réécriture', texte: 'Votre Site regagne 35 points et toute contamination disparaît.' },
  'perso:o5-1': { id: 'veto', nom: 'Veto', texte: 'Le Site adverse perd 15 points, et votre prochain reconfinement réussit d’office.' },
  'perso:aaron-siegel': {
    id: 'revelation',
    nom: 'Révélation',
    texte: 'La main adverse est révélée, et vos deux prochaines questions n’ont plus que deux réponses.',
  },
  'scp-173': { id: 'clignement', nom: 'Clignement', texte: 'Les deux prochaines questions adverses n’ont que 8 secondes.' },
  'scp-2747': { id: 'effacement', nom: 'Effacement', texte: 'L’adversaire rate d’office son prochain reconfinement : la page est effacée.' },
}

/** La Manifestation d'une équipe : celle de sa première Mythique, sinon le Protocole d'urgence */
export function manifestationDe(equipe: Carte[]): Manifestation {
  const m = equipe.find((c) => c.ra === 5 && MANIFESTATIONS[c.id])
  return m ? { ...MANIFESTATIONS[m.id], carte: m.id } : URGENCE
}

/** Applique une Manifestation (camps et mains modifiés en place) */
export function manifester(
  m: Manifestation,
  auteur: 'joueur' | 'ia',
  camps: Record<'joueur' | 'ia', CampReco>,
  mains: Record<'joueur' | 'ia', string[]>,
  hasard: () => number = Math.random,
): Evenement[] {
  const adverse = auteur === 'joueur' ? 'ia' : 'joueur'
  const moi = camps[auteur]
  const lui = camps[adverse]
  moi.manifeste = true
  moi.manifestation = 0
  const ev: Evenement[] = [{ camp: auteur, type: 'manifestation', texte: `${m.nom} : ${m.texte}` }]
  switch (m.id) {
    case 'chaines':
      for (let i = 0; i < 2 && mains[adverse].length > 1; i++) mains[adverse].splice(Math.floor(hasard() * mains[adverse].length), 1)
      break
    case 'patmos':
      lui.integrite = Math.max(0, lui.integrite - 30)
      lui.manifestation = 0
      break
    case 'main-rouge':
      moi.reconfinementsAuto += 2
      break
    case 'reecriture':
      moi.integrite = Math.min(INTEGRITE_SITE, moi.integrite + 35)
      moi.poison = 0
      break
    case 'veto':
      lui.integrite = Math.max(0, lui.integrite - 15)
      moi.reconfinementsAuto += 1
      break
    case 'revelation':
      moi.questionsFaciles += 2
      break
    case 'clignement':
      lui.questionsCourtes += 2
      break
    case 'effacement':
      lui.echecsAuto += 1
      break
    default:
      moi.integrite = Math.min(INTEGRITE_SITE, moi.integrite + 20)
  }
  return ev
}

/** Fin de tour : la contagion ronge, les effets à durée s'usent */
export function finDeTour(
  camps: Record<'joueur' | 'ia', CampReco>,
  consommes: Record<'joueur' | 'ia', Partial<Record<keyof CampReco, boolean>>>,
  ev: Evenement[],
) {
  for (const x of ['joueur', 'ia'] as const) {
    const c = camps[x]
    if (c.poison > 0 && c.integrite > 0) {
      c.integrite = Math.max(0, c.integrite - c.poison)
      ev.push({ camp: x, type: 'poison', valeur: c.poison, texte: `La contamination ronge le Site : −${c.poison}` })
    }
    for (const k of ['reconfinementsAuto', 'questionsCourtes', 'echecsAuto', 'questionsFaciles'] as const) {
      if (consommes[x][k] && c[k] > 0) c[k]--
    }
  }
}

/** Le choix de l'IA : une anomalie le plus souvent, un soutien quand elle est en danger ou devine une grosse menace */
export function choisirIAReco(main: Carte[], camp: CampReco, finesse: number, hasard: () => number = Math.random): Carte {
  const notes = main.map((c) => {
    let v = nature(c) === 'anomalie' ? c.atk * (effetDe(c).force ?? 1) + (effetDe(c).alteration ? 12 : 0) : c.def * 0.6
    if (nature(c) === 'soutien' && soutien(c) === 'site') v = camp.integrite < 60 ? c.def * 1.2 : 15
    v *= 1 - (1 - finesse) * hasard()
    return { c, v }
  })
  notes.sort((a, b) => b.v - a.v)
  return notes[0].c
}
