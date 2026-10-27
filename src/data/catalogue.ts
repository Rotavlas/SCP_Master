import type { Carte, Catalogue, Classe, Rarete, Traductions, TypeFiche } from '../types'

export const RARETES: { nom: string; couleur: string }[] = [
  { nom: 'Commune', couleur: '#9aa3a8' },
  { nom: 'Peu commune', couleur: '#5fbf7f' },
  { nom: 'Rare', couleur: '#4a9dff' },
  { nom: 'Épique', couleur: '#b26bff' },
  { nom: 'Légendaire', couleur: '#f4b740' },
  { nom: 'Mythique', couleur: '#ff3b5c' },
]

export const CLASSES: Record<Classe, { nom: string; couleur: string }> = {
  safe: { nom: 'Safe', couleur: '#3fa66b' },
  euclid: { nom: 'Euclid', couleur: '#e3b23c' },
  keter: { nom: 'Keter', couleur: '#d64033' },
  thaumiel: { nom: 'Thaumiel', couleur: '#3b6fd8' },
  apollyon: { nom: 'Apollyon', couleur: '#8b0f1e' },
  neutralized: { nom: 'Neutralized', couleur: '#7d8589' },
  explained: { nom: 'Explained', couleur: '#5d8aa8' },
  decommissioned: { nom: 'Decommissioned', couleur: '#6b5a4a' },
  pending: { nom: 'Pending', couleur: '#b8b8b8' },
  'esoteric-class': { nom: 'Esoteric', couleur: '#9b59b6' },
}

export const TYPES: Record<TypeFiche, { nom: string; pluriel: string; court: string; couleur: string; article: string }> = {
  s: { nom: 'SCP', pluriel: 'SCP', court: 'SCP', couleur: '#c0392b', article: 'quel SCP' },
  f: { nom: 'Équipe FIM', pluriel: 'Équipes FIM', court: 'FIM', couleur: '#2e7d6b', article: 'quelle équipe FIM' },
  p: { nom: 'Personnel', pluriel: 'Personnel', court: 'Personnel', couleur: '#4b5d7a', article: 'qui' },
  e: { nom: 'Département', pluriel: 'Départements', court: 'Dépt', couleur: '#5b6b3a', article: 'quel département' },
  l: { nom: 'Site', pluriel: 'Sites', court: 'Site', couleur: '#3a5f73', article: 'quel site' },
  g: { nom: "Groupe d'intérêt", pluriel: "Groupes d'intérêt", court: 'GdI', couleur: '#7a4f9a', article: "quel Groupe d'intérêt" },
  n: { nom: 'Canon', pluriel: 'Canons', court: 'Canon', couleur: '#a0522d', article: 'quel canon' },
  d: { nom: 'Document de GdI', pluriel: 'Documents de GdI', court: 'Doc. GdI', couleur: '#4f6f9a', article: 'quel document' },
  c: { nom: 'Conte', pluriel: 'Contes', court: 'Conte', couleur: '#8a6d3b', article: 'quel conte' },
}

export const ORDRE_TYPES: TypeFiche[] = ['s', 'f', 'p', 'e', 'l', 'g', 'n', 'd', 'c']

export function nomClasse(carte: Carte): string {
  return carte.ce ?? (carte.c ? CLASSES[carte.c].nom : '')
}

/** Étiquette du coin supérieur gauche : désignation ou type de fiche. */
export function entete(carte: Carte): string {
  return carte.num ?? TYPES[carte.k].court.toUpperCase()
}

/** Pastille du coin supérieur droit : classe pour un SCP, sous-catégorie sinon. */
export function pastille(carte: Carte): { texte: string; couleur: string } {
  if (carte.k === 's') return { texte: nomClasse(carte), couleur: CLASSES[carte.c ?? 'pending'].couleur }
  if (carte.k === 'p' && carte.cat === 'Conseil O5') return { texte: carte.cat, couleur: '#1b1b1b' }
  return { texte: carte.cat ?? TYPES[carte.k].court, couleur: TYPES[carte.k].couleur }
}

/** Comment désigner une carte dans une phrase : « SCP-173 », « MTF Epsilon-11 », « Dr. Alto Clef »… */
export function designation(carte: Carte): string {
  if (carte.num) return carte.num
  return carte.k === 'p' ? carte.nm : `« ${carte.nm} »`
}

export class Base {
  readonly cartes: Carte[]
  readonly parId = new Map<string, Carte>()
  readonly parRarete: Carte[][] = RARETES.map(() => [])
  /** Cartes par type puis par rareté */
  readonly parType = new Map<TypeFiche, Carte[][]>()
  readonly prefixeImage: string
  readonly genere: string
  readonly catalogue: Catalogue

  constructor(catalogue: Catalogue, traductions?: Traductions) {
    this.catalogue = catalogue
    this.cartes = traductions
      ? catalogue.cartes.map((c) => (traductions[c.id] ? { ...c, ...traductions[c.id], vf: true } : c))
      : catalogue.cartes
    this.prefixeImage = catalogue.prefixeImage
    this.genere = catalogue.genere
    for (const k of ORDRE_TYPES) this.parType.set(k, RARETES.map(() => []))
    for (const c of this.cartes) {
      this.parId.set(c.id, c)
      this.parRarete[c.ra].push(c)
      this.parType.get(c.k)![c.ra].push(c)
    }
  }

  image(carte: Carte): string | null {
    if (!carte.img) return null
    return carte.img.startsWith('http') ? carte.img : this.prefixeImage + carte.img
  }

  /**
   * L'image réduite à la taille d'une carte par wsrv.nl : environ dix fois plus légère que l'originale
   * du wiki, et mise en cache pour tous les joueurs. Carte.tsx revient à l'originale si elle échoue.
   */
  vignette(carte: Carte): string | null {
    const source = this.image(carte)
    if (!source || /\.svg(\?|$)/i.test(source)) return source
    // n=-1 garde toutes les images d'un GIF animé
    return `https://wsrv.nl/?url=${encodeURIComponent(source)}&w=600&we&output=webp&q=78${/\.gif(\?|$)/i.test(source) ? '&n=-1' : ''}`
  }

  /** Une carte au hasard d'une rareté donnée, parmi certains types. */
  auHasard(rarete: Rarete, types?: TypeFiche[]): Carte {
    if (!types) {
      const liste = this.parRarete[rarete]
      return liste[Math.floor(Math.random() * liste.length)]
    }
    const pools = types.map((k) => this.parType.get(k)![rarete]).filter((l) => l.length)
    const total = pools.reduce((s, l) => s + l.length, 0)
    let x = Math.floor(Math.random() * total)
    for (const l of pools) {
      if (x < l.length) return l[x]
      x -= l.length
    }
    return this.auHasard(rarete)
  }

  avecTraductions(traductions: Traductions | null): Base {
    return new Base(this.catalogue, traductions ?? undefined)
  }
}

/** Empreinte du catalogue, fixée par vite.config.ts (absente hors du site, dans la fonction Edge) */
declare const __VERSION_CARTES__: string
const version = () => (typeof __VERSION_CARTES__ === 'string' ? `?v=${__VERSION_CARTES__}` : '')

export async function chargerBase(): Promise<Base> {
  const reponse = await fetch(`${import.meta.env.BASE_URL}data/cards.json${version()}`)
  if (!reponse.ok) throw new Error(`Base de données inaccessible (${reponse.status})`)
  return new Base((await reponse.json()) as Catalogue)
}

export async function chargerTraductions(): Promise<Traductions> {
  const reponse = await fetch(`${import.meta.env.BASE_URL}data/cards.fr.json${version()}`)
  if (!reponse.ok) throw new Error(`Traductions inaccessibles (${reponse.status})`)
  return (await reponse.json()) as Traductions
}

export function lienWiki(carte: Carte): string {
  if (carte.u) return `https://scp-wiki.wikidot.com/${carte.u}`
  return `https://scp-wiki.wikidot.com/${carte.id}`
}

/** Page de la traduction française, pour les SCP traduits par la branche FR. */
export function lienWikiFr(carte: Carte): string | null {
  if (!carte.vf) return null
  return `https://fondationscp.wikidot.com/${carte.u ?? carte.id}`
}
