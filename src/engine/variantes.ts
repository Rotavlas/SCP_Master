/**
 * Variantes rares d'une même carte : purement visuelles, elles se collectionnent à part.
 * Chaque carte tirée a une petite chance d'en être une, quelle que soit sa rareté
 * (tirage sur le serveur, prive.tirer_variante, avec les mêmes chances).
 */
export type IdVariante = 'std' | 'holo' | 'exp' | 'arch' | 'breche' | 'o5' | 'negatif' | 'esquisse'

export interface Variante {
  id: IdVariante
  nom: string
  description: string
  /** Chance par carte tirée dans un dossier standard (pour une variante de Mythique : par Mythique tirée) */
  chance: number
  couleur: string
  /** Réservée aux Mythiques : elle joue sur leur illustration en pleine page */
  mythique?: boolean
}

export const VARIANTES: Variante[] = [
  { id: 'std', nom: 'Standard', description: "Le dossier tel qu'archivé.", chance: 0, couleur: '#9aa3a8' },
  { id: 'holo', nom: 'Holographique', description: 'Pellicule irisée sur toute la carte.', chance: 0.04, couleur: '#7fd6ff' },
  { id: 'exp', nom: 'Expurgée', description: "Version censurée, tamponnée par l'Éthique.", chance: 0.02, couleur: '#e04a3c' },
  { id: 'arch', nom: "Archive d'origine", description: 'Papier jauni, tapé à la machine en 19██.', chance: 0.012, couleur: '#c9a66b' },
  { id: 'breche', nom: 'Brèche', description: 'La carte elle-même échappe au confinement.', chance: 0.005, couleur: '#ff3df0' },
  { id: 'o5', nom: 'Sceau O5', description: "Dorure à l'or fin, réservée au Conseil.", chance: 0.0015, couleur: '#f4c542' },
  {
    id: 'negatif',
    nom: 'Négatif',
    description: "La scène en négatif, comme sur la pellicule d'une caméra de confinement.",
    chance: 0.05,
    couleur: '#bfe3ff',
    mythique: true,
  },
  {
    id: 'esquisse',
    nom: "Épreuve d'artiste",
    description: "La scène au crayon, sur papier, avant l'encrage.",
    chance: 0.04,
    couleur: '#cdbf9f',
    mythique: true,
  },
]

/** Les communes et peu communes sortent deux fois moins souvent en variante (ouvrir_booster) */
export const FACTEUR_COMMUNES = 0.5

/** Chance qu'une fiche de cette rareté sorte dans cette variante, depuis un dossier sans bonus */
export const chanceVariante = (v: Variante, rarete: number) => (v.mythique ? v.chance : rarete <= 1 ? v.chance * FACTEUR_COMMUNES : v.chance)

/** Les variantes qu'une carte peut porter : celles des Mythiques n'existent que pour elles */
export const variantesPour = (carte: { ra: number }) => VARIANTES.filter((v) => !v.mythique || carte.ra === 5)

export const PAR_ID = Object.fromEntries(VARIANTES.map((v) => [v.id, v])) as Record<IdVariante, Variante>

/** Ordre de prestige, pour choisir la variante affichée par défaut. */
export const PRESTIGE: IdVariante[] = ['o5', 'breche', 'esquisse', 'negatif', 'arch', 'exp', 'holo', 'std']
