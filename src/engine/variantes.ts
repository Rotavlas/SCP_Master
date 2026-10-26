/**
 * Variantes rares d'une même carte : purement visuelles, elles se collectionnent à part.
 * Chaque carte tirée a une petite chance d'en être une, quelle que soit sa rareté
 * (tirage sur le serveur, prive.tirer_variante, avec les mêmes chances).
 */
export type IdVariante = 'std' | 'holo' | 'exp' | 'arch' | 'breche' | 'o5'

export interface Variante {
  id: IdVariante
  nom: string
  description: string
  /** Chance par carte tirée dans un dossier standard */
  chance: number
  couleur: string
}

export const VARIANTES: Variante[] = [
  { id: 'std', nom: 'Standard', description: 'Le dossier tel qu\'archivé.', chance: 0, couleur: '#9aa3a8' },
  { id: 'holo', nom: 'Holographique', description: 'Pellicule irisée sur toute la carte.', chance: 0.04, couleur: '#7fd6ff' },
  { id: 'exp', nom: 'Expurgée', description: 'Version censurée, tamponnée par l\'Éthique.', chance: 0.02, couleur: '#e04a3c' },
  { id: 'arch', nom: 'Archive d\'origine', description: 'Papier jauni, tapé à la machine en 19██.', chance: 0.012, couleur: '#c9a66b' },
  { id: 'breche', nom: 'Brèche', description: 'La carte elle-même échappe au confinement.', chance: 0.005, couleur: '#ff3df0' },
  { id: 'o5', nom: 'Sceau O5', description: 'Dorure à l\'or fin, réservée au Conseil.', chance: 0.0015, couleur: '#f4c542' },
]

export const PAR_ID = Object.fromEntries(VARIANTES.map((v) => [v.id, v])) as Record<IdVariante, Variante>

/** Ordre de prestige, pour choisir la variante affichée par défaut. */
export const PRESTIGE: IdVariante[] = ['o5', 'breche', 'arch', 'exp', 'holo', 'std']
