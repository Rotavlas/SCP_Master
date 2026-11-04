/**
 * Les cosmétiques : titres (sous le pseudo, dans le profil), cadres de profil et couvertures de dossier (à l'ouverture
 * des dossiers). Le serveur décide du type, du prix et de qui les possède (prive.cosmetiques) : cette liste ne sert
 * qu'à les nommer et les dessiner. Les titres et cadres des Groupes d'intérêt se gagnent en complétant leur collection.
 */
export type TypeCosmetique = 'titre' | 'cadre' | 'couverture'

export interface Cosmetique {
  nom: string
  description: string
  /** Couleur dominante (cadres des Groupes, aperçus) */
  couleur: string
}

/** Les couleurs des Groupes d'intérêt, pour leurs cadres */
const GROUPES: Record<string, { nom: string; titre: string; couleur: string }> = {
  'main-du-serpent': { nom: 'la Main du Serpent', titre: 'Lecteur de la Bibliothèque', couleur: '#3fa66b' },
  wilson: { nom: 'Wilson’s Wildlife Solutions', titre: 'Soigneur de chez Wilson', couleur: '#c98a3c' },
  awcy: { nom: 'Are We Cool Yet?', titre: 'Artiste incompris', couleur: '#e05bb5' },
  spc: { nom: 'le Centre de boxe anti-requins', titre: 'Boxeur de requins', couleur: '#3c8fd6' },
  mcd: { nom: 'Marshall, Carter & Dark', titre: 'Client privilégié', couleur: '#c9a646' },
  uiu: { nom: 'l’Unité des incidents inhabituels', titre: 'Agent spécial du FBI', couleur: '#5a7bb8' },
  com: { nom: 'la Coalition occulte mondiale', titre: 'Opérateur de la Coalition', couleur: '#7d8a5a' },
  'reine-noire': { nom: 'la Reine Noire', titre: 'Pion de la Reine Noire', couleur: '#9b5ad1' },
  cirque: { nom: 'le Cirque de l’inquiétant', titre: 'Spectateur du Cirque', couleur: '#d1453a' },
  insurrection: { nom: 'l’Insurrection du Chaos', titre: 'Agent double', couleur: '#5d8f3a' },
  prometheus: { nom: 'Prometheus Labs', titre: 'Ingénieur de Prometheus', couleur: '#e07b2c' },
  'dieu-brise': { nom: 'l’Église du Dieu Brisé', titre: 'Fidèle du Mékhanite', couleur: '#a8a39a' },
}

export const COSMETIQUES: Record<string, Cosmetique & { type: TypeCosmetique }> = {
  'titre-agent-terrain': { type: 'titre', nom: 'Agent de terrain', description: 'Le premier galon.', couleur: '#9aa3a8' },
  'titre-chercheur': { type: 'titre', nom: 'Chercheur associé', description: 'Accès aux laboratoires.', couleur: '#5fbf7f' },
  'titre-archiviste-chef': { type: 'titre', nom: 'Archiviste en chef', description: 'Gardien des dossiers.', couleur: '#4a9dff' },
  'titre-superviseur': { type: 'titre', nom: 'Superviseur de site', description: 'Un site entier sous sa responsabilité.', couleur: '#b26bff' },
  'titre-directeur': { type: 'titre', nom: 'Directeur de site', description: 'Rend compte au Conseil seulement.', couleur: '#f4b740' },
  'titre-eminence': { type: 'titre', nom: 'Éminence grise du Conseil', description: 'Personne ne sait qui vous êtes vraiment.', couleur: '#ff3b5c' },
  'cadre-acier': { type: 'cadre', nom: 'Acier brossé', description: 'Un liseré métallique, sobre.', couleur: '#9fb0b8' },
  'cadre-laiton': { type: 'cadre', nom: 'Laiton', description: 'La plaque des bureaux de direction.', couleur: '#c9a24a' },
  'cadre-confinement': { type: 'cadre', nom: 'Zone de confinement', description: 'Les bandes jaunes et noires des cellules.', couleur: '#f0c419' },
  'cadre-sceau-or': { type: 'cadre', nom: 'Sceau d’or', description: 'Dorure à l’or fin, scintillante.', couleur: '#f4c542' },
  'couv-quadrille': { type: 'couverture', nom: 'Papier quadrillé', description: 'Le dossier sur papier millimétré du bureau d’études.', couleur: '#7fb6d8' },
  'couv-ruban-keter': { type: 'couverture', nom: 'Ruban Keter', description: 'Barré d’un ruban rouge « ACCÈS RESTREINT ».', couleur: '#d23a2c' },
  'couv-marbre': { type: 'couverture', nom: 'Marbre veiné d’or', description: 'La chemise prend le grain du marbre, veiné d’or.', couleur: '#d9c48a' },
  'couv-dorure-o5': { type: 'couverture', nom: 'Dorure O5', description: 'Feuille d’or et reflets, réservée au Conseil.', couleur: '#f4c542' },
  ...Object.fromEntries(
    Object.entries(GROUPES).flatMap(([id, g]) => [
      [`titre-${id}`, { type: 'titre' as const, nom: g.titre, description: `Collection complète : ${g.nom}.`, couleur: g.couleur }],
      [`cadre-${id}`, { type: 'cadre' as const, nom: `Cadre de ${g.nom}`, description: `Collection complète : ${g.nom}.`, couleur: g.couleur }],
    ]),
  ),
}

export const TYPES_COSMETIQUES: { type: TypeCosmetique; nom: string; aide: string }[] = [
  { type: 'titre', nom: 'Titres', aide: 'Affiché sous votre pseudo, dans votre profil.' },
  { type: 'cadre', nom: 'Cadres de profil', aide: 'Encadre votre dossier du personnel, vu de tous.' },
  { type: 'couverture', nom: 'Couvertures de dossier', aide: 'La chemise des dossiers que vous ouvrez.' },
]

/** Le cadre d'un profil : la classe CSS et la couleur à lui donner */
export function styleCadre(id: string | null | undefined): { className: string; style?: Record<string, string> } {
  if (!id || !COSMETIQUES[id]) return { className: '' }
  const groupe = id.replace(/^cadre-/, '')
  return GROUPES[groupe]
    ? { className: 'cadre-profil cadre-groupe', style: { '--cadre': COSMETIQUES[id].couleur } }
    : { className: `cadre-profil ${id}`, style: { '--cadre': COSMETIQUES[id].couleur } }
}
