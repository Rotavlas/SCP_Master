/**
 * Les synergies d'une équipe : des cartes qui ont un point commun travaillent mieux ensemble. Chaque synergie donne
 * deux secondes de plus pour répondre, deux synergies au plus (+4 s), dans les combats contre l'IA (Éclair,
 * Reconfinement, Brèche). Ni en JcJ ni à l'Épreuve, qui comptent pour les classements.
 * Partagé par le navigateur (affichage) et le serveur (serveur/duel.ts, reconfinement.ts, breche.ts).
 */
import type { Carte } from '../types'

export const SECONDES_PAR_SYNERGIE = 2
export const SYNERGIES_MAX = 2

/** Les Groupes d'intérêt, par leur tag du wiki */
const GROUPES: Record<string, string> = {
  'serpents-hand': 'la Main du Serpent',
  'chaos-insurgency': 'l’Insurrection du Chaos',
  'global-occult-coalition': 'la Coalition occulte mondiale',
  'marshall-carter-and-dark': 'Marshall, Carter & Dark',
  'are-we-cool-yet': 'Are We Cool Yet?',
  'broken-god': 'l’Église du Dieu Brisé',
  prometheus: 'Prometheus Labs',
  'wilsons-wildlife': 'Wilson’s Wildlife Solutions',
  'unusual-incidents-unit': 'l’Unité des incidents inhabituels',
  'herman-fuller': 'le Cirque d’Herman Fuller',
  'black-queen': 'la Reine Noire',
  sarkic: 'les Sarkiques',
  'gru-division-p': 'le GRU Division P',
  'horizon-initiative': 'l’Initiative de l’Horizon',
  oneiroi: 'les Oneiroi',
  fifthist: 'l’Église du Cinquième',
  anderson: 'Anderson Robotics',
  'dr-wondertainment': 'le Dr Wondertainment',
  factory: 'l’Usine',
  'manna-charitable-foundation': 'la Fondation caritative Manna',
  ijamea: 'l’IJAMEA',
  obskura: 'l’Obskuraprojekt',
  alexylva: 'l’Université d’Alexylva',
  nobody: 'Personne',
  'shark-punching-center': 'le Centre de boxe anti-requins',
  daevite: 'les Daevites',
  'three-moons-initiative': 'l’Initiative des Trois Lunes',
  parawatch: 'Parawatch',
  'deer-college': 'le Deer College',
}

const SERIES = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const CLASSES: Record<string, string> = { safe: 'Safe', euclid: 'Euclid', keter: 'Keter', thaumiel: 'Thaumiel', apollyon: 'Apollyon' }

export interface Synergie {
  id: string
  nom: string
  detail: string
  /** Les cartes de l'équipe qui la forment */
  cartes: string[]
}

/** Le plus grand groupe de cartes qui partagent une même clé */
function meilleur(cartes: Carte[], cles: (c: Carte) => string[]): { cle: string; cartes: Carte[] } | null {
  const groupes = new Map<string, Carte[]>()
  for (const c of cartes) for (const k of new Set(cles(c))) groupes.set(k, [...(groupes.get(k) ?? []), c])
  let mieux: { cle: string; cartes: Carte[] } | null = null
  for (const [cle, l] of groupes) if (!mieux || l.length > mieux.cartes.length) mieux = { cle, cartes: l }
  return mieux
}

/** Les synergies de l'équipe, dans l'ordre où elles comptent (les deux premières donnent leur bonus). */
export function synergies(equipe: Carte[]): Synergie[] {
  const res: Synergie[] = []
  const groupe = meilleur(equipe, (c) => (c.t ?? []).filter((t) => t in GROUPES))
  if (groupe && groupe.cartes.length >= 2)
    res.push({
      id: 'groupe',
      nom: 'Groupe d’intérêt',
      detail: `${groupe.cartes.length} fiches liées à ${GROUPES[groupe.cle]}`,
      cartes: groupe.cartes.map((c) => c.id),
    })
  const scp = equipe.filter((c) => c.k === 's')
  const serie = meilleur(scp, (c) => (c.s ? [String(c.s)] : []))
  if (serie && serie.cartes.length >= 3)
    res.push({
      id: 'serie',
      nom: 'Même série',
      detail: `${serie.cartes.length} SCP de la série ${SERIES[Number(serie.cle)] ?? serie.cle}`,
      cartes: serie.cartes.map((c) => c.id),
    })
  const auteur = meilleur(equipe, (c) => (c.a ? [c.a] : []))
  if (auteur && auteur.cartes.length >= 2)
    res.push({ id: 'auteur', nom: 'Même plume', detail: `${auteur.cartes.length} fiches de ${auteur.cle}`, cartes: auteur.cartes.map((c) => c.id) })
  const classe = meilleur(scp, (c) => (c.c && CLASSES[c.c] ? [c.c] : []))
  if (classe && classe.cartes.length >= 3)
    res.push({
      id: 'classe',
      nom: `Protocole ${CLASSES[classe.cle]}`,
      detail: `${classe.cartes.length} SCP de classe ${CLASSES[classe.cle]}`,
      cartes: classe.cartes.map((c) => c.id),
    })
  return res
}

/** Les secondes de plus pour répondre que donne l'équipe */
export function bonusTemps(equipe: Carte[]): number {
  return Math.min(SYNERGIES_MAX, synergies(equipe).length) * SECONDES_PAR_SYNERGIE
}
