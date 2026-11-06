/**
 * Les synergies d'une équipe : des cartes qui ont un point commun travaillent mieux ensemble, dans les combats contre
 * l'IA (Éclair, Reconfinement, Brèche ; ni en JcJ ni à l'Épreuve, qui comptent pour les classements).
 * - Les synergies ordinaires donnent chacune deux secondes de plus pour répondre, deux au plus (+4 s).
 * - Les synergies d'exception ont chacune leur effet ; une seule compte.
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

export type Effet = 'temps' | 'integrite' | 'retrait' | 'hesitation'

/** Ce que donne une synergie d'exception */
export const EFFETS: Record<Exclude<Effet, 'temps'>, string> = {
  integrite: '+10 d’intégrité au départ (Éclair, Reconfinement)',
  retrait: 'une mauvaise réponse retirée à la première question',
  hesitation: 'l’IA répond une seconde plus tard',
}
export const INTEGRITE_EXCEPTION = 10
export const HESITATION_IA = 1

export interface Synergie {
  id: string
  nom: string
  detail: string
  /** Les cartes de l'équipe qui la forment */
  cartes: string[]
  effet: Effet
}

/** Le plus grand groupe de cartes qui partagent une même clé */
function meilleur(cartes: Carte[], cles: (c: Carte) => string[]): { cle: string; cartes: Carte[] } | null {
  const groupes = new Map<string, Carte[]>()
  for (const c of cartes) for (const k of new Set(cles(c))) groupes.set(k, [...(groupes.get(k) ?? []), c])
  let mieux: { cle: string; cartes: Carte[] } | null = null
  for (const [cle, l] of groupes) if (!mieux || l.length > mieux.cartes.length) mieux = { cle, cartes: l }
  return mieux
}

/** Les synergies thématiques : au moins `seuil` fiches qui portent l'un de ces tags du wiki */
const THEMES: { id: string; nom: string; tags: string[]; seuil: number; detail: string }[] = [
  {
    id: 'informationnel',
    nom: 'Danger informationnel',
    tags: ['memetic', 'cognitohazard', 'antimemetic', 'infohazard'],
    seuil: 3,
    detail: 'mémétiques, cognitodangers ou antimémétiques',
  },
  {
    id: 'espace-temps',
    nom: 'Espace-temps',
    tags: ['temporal', 'spatial', 'teleportation', 'extradimensional'],
    seuil: 3,
    detail: 'temporelles, spatiales ou extradimensionnelles',
  },
  {
    id: 'fin-du-monde',
    nom: 'Fin du monde',
    tags: ['k-class-scenario', 'reality-bending'],
    seuil: 2,
    detail: 'scénario de classe K ou altération de la réalité',
  },
  { id: 'bestiaire', nom: 'Bestiaire', tags: ['animal', 'biological', 'species'], seuil: 3, detail: 'animales ou biologiques' },
]

/** Les fiches de référence liées à un SCP de l'équipe (champ « lie » du catalogue), par type */
const LIENS: Partial<Record<Carte['k'], { id: string; nom: string; verbe: string }>> = {
  f: { id: 'fim', nom: 'Unité dédiée', verbe: 'a confiné' },
  l: { id: 'site', nom: 'Site d’affectation', verbe: 'confine' },
  e: { id: 'departement', nom: 'Département de tutelle', verbe: 'suit' },
  p: { id: 'personnel', nom: 'Chercheur référent', verbe: 'connaît' },
  g: { id: 'gdi', nom: 'Groupe impliqué', verbe: 'est mêlé à' },
  n: { id: 'canon', nom: 'Même canon', verbe: 'raconte' },
}

/** Les synergies de l'équipe : les ordinaires d'abord (les deux premières comptent), puis les exceptions (la première compte). */
export function synergies(equipe: Carte[]): Synergie[] {
  const res: Synergie[] = []
  const ajouter = (id: string, nom: string, detail: string, cartes: Carte[], effet: Effet = 'temps') =>
    res.push({ id, nom, detail, cartes: cartes.map((c) => c.id), effet })
  const scp = equipe.filter((c) => c.k === 's')

  // Fiches de référence liées à un SCP de l'équipe : une FIM qui l'a confiné, son Site, son Département…
  const numeros = new Map(scp.filter((c) => c.num).map((c) => [c.num!, c]))
  for (const ref of equipe) {
    const l = LIENS[ref.k]
    if (!l || res.some((x) => x.id === l.id)) continue
    const lie = (ref.lie ?? []).map((n) => numeros.get(n)).filter((c): c is Carte => !!c)
    if (lie.length) ajouter(l.id, l.nom, `${ref.num ?? ref.nm} ${l.verbe} ${lie.map((c) => c.num).join(', ')}`, [ref, ...lie])
  }
  const groupe = meilleur(equipe, (c) => (c.t ?? []).filter((t) => t in GROUPES))
  if (groupe && groupe.cartes.length >= 2) ajouter('groupe', 'Groupe d’intérêt', `${groupe.cartes.length} fiches liées à ${GROUPES[groupe.cle]}`, groupe.cartes)
  const gdi = equipe.filter((c) => c.k === 'g')
  if (gdi.length >= 2) ajouter('negociations', 'Table des négociations', `${gdi.length} fiches de Groupes d’intérêt`, gdi)
  for (const t of THEMES) {
    const l = equipe.filter((c) => (c.t ?? []).some((x) => t.tags.includes(x)))
    if (l.length >= t.seuil) ajouter(t.id, t.nom, `${l.length} fiches ${t.detail}`, l)
  }
  const serie = meilleur(scp, (c) => (c.s ? [String(c.s)] : []))
  if (serie && serie.cartes.length >= 3)
    ajouter('serie', 'Même série', `${serie.cartes.length} SCP de la série ${SERIES[Number(serie.cle)] ?? serie.cle}`, serie.cartes)
  const voisins = scp.filter((c) => c.n !== undefined && c.n > 1 && scp.some((d) => d !== c && Math.abs((d.n ?? -9) - c.n!) === 1))
  if (voisins.length >= 2) ajouter('voisins', 'Voisins de cellule', `${voisins.map((c) => c.num).join(' et ')} : numéros qui se suivent`, voisins)
  const auteur = meilleur(equipe, (c) => (c.a ? [c.a] : []))
  if (auteur && auteur.cartes.length >= 2) ajouter('auteur', 'Même plume', `${auteur.cartes.length} fiches de ${auteur.cle}`, auteur.cartes)
  const annee = meilleur(equipe, (c) => (c.y ? [String(c.y)] : []))
  if (annee && annee.cartes.length >= 3) ajouter('promotion', `Promotion ${annee.cle}`, `${annee.cartes.length} fiches publiées en ${annee.cle}`, annee.cartes)
  const classe = meilleur(scp, (c) => (c.c && CLASSES[c.c] ? [c.c] : []))
  if (classe && classe.cartes.length >= 3)
    ajouter('classe', `Protocole ${CLASSES[classe.cle]}`, `${classe.cartes.length} SCP de classe ${CLASSES[classe.cle]}`, classe.cartes)

  // Les exceptions
  const un = scp.find((c) => c.num === 'SCP-001')
  if (un) ajouter('cle-de-voute', 'Clé de voûte', `${un.nm}, une proposition pour SCP-001`, [un], 'hesitation')
  const thaumiel = scp.find((c) => c.c === 'thaumiel')
  const keter = scp.filter((c) => c.c === 'keter')
  if (thaumiel && keter.length)
    ajouter('contre-feu', 'Contre-feu', `${thaumiel.num} (Thaumiel) face à ${keter.map((c) => c.num).join(', ')} (Keter)`, [thaumiel, ...keter], 'retrait')
  const types = new Set(equipe.map((c) => c.k))
  if (types.size >= 4) ajouter('intervention', 'Équipe d’intervention', `${types.size} types de fiches différents`, equipe, 'integrite')
  return res
}

/** Les synergies qui comptent vraiment (deux ordinaires, une exception) */
export function synergiesActives(equipe: Carte[]): Synergie[] {
  const l = synergies(equipe)
  return [...l.filter((s) => s.effet === 'temps').slice(0, SYNERGIES_MAX), ...l.filter((s) => s.effet !== 'temps').slice(0, 1)]
}

/** Ce que l'équipe apporte en combat contre l'IA */
export function effetsEquipe(equipe: Carte[]): { temps: number; integrite: number; retrait: boolean; hesitation: number } {
  const actives = synergiesActives(equipe)
  const exception = actives.find((s) => s.effet !== 'temps')?.effet
  return {
    temps: actives.filter((s) => s.effet === 'temps').length * SECONDES_PAR_SYNERGIE,
    integrite: exception === 'integrite' ? INTEGRITE_EXCEPTION : 0,
    retrait: exception === 'retrait',
    hesitation: exception === 'hesitation' ? HESITATION_IA : 0,
  }
}

/** Les secondes de plus pour répondre que donne l'équipe */
export function bonusTemps(equipe: Carte[]): number {
  return effetsEquipe(equipe).temps
}
