/**
 * Badges de profil. Le serveur décide lesquels un agent a obtenus (prive.badges_obtenus) :
 * cette liste ne sert qu'à les nommer et les dessiner, dans le même ordre.
 */
export interface Badge {
  nom: string
  description: string
  /** Glyphe dessiné dans la pastille */
  glyphe: string
  couleur: string
}

export const BADGES: Record<string, Badge> = {
  createur: { nom: 'Créateur du jeu', description: 'A conçu SCP Masters.', glyphe: '✦', couleur: '#ff3b5c' },
  'premier-dossier': { nom: 'Premier dossier', description: 'Ouvrir un premier dossier.', glyphe: '▣', couleur: '#c9b98f' },
  archiviste: { nom: 'Archiviste', description: '100 fiches différentes.', glyphe: '▤', couleur: '#5fbf7f' },
  conservateur: { nom: 'Conservateur', description: '1 000 fiches différentes.', glyphe: '▥', couleur: '#4a9dff' },
  bibliothecaire: { nom: 'Bibliothécaire', description: '5 000 fiches différentes.', glyphe: '❧', couleur: '#b26bff' },
  legende: { nom: 'Légende', description: 'Posséder une Légendaire.', glyphe: '★', couleur: '#f4b740' },
  pantheon: { nom: 'Panthéon', description: '10 Légendaires ou Mythiques différentes.', glyphe: '✪', couleur: '#f4b740' },
  'niveau-5': { nom: 'Niveau 5', description: 'Posséder une Mythique.', glyphe: 'Ω', couleur: '#ff3b5c' },
  'variante-o5': { nom: 'Sceau O5', description: 'Posséder une variante O5.', glyphe: '⌬', couleur: '#e6e6e6' },
  duelliste: { nom: 'Duelliste', description: 'Gagner un duel entre joueurs.', glyphe: '⚔', couleur: '#d23a2c' },
  veteran: { nom: 'Vétéran', description: '25 victoires entre joueurs.', glyphe: '⛨', couleur: '#d23a2c' },
  elite: { nom: "Agent d'élite", description: 'Atteindre 1 200 Elo.', glyphe: '▲', couleur: '#4dd2ff' },
  commandant: { nom: 'Commandant', description: 'Atteindre 1 500 Elo.', glyphe: '♛', couleur: '#4dd2ff' },
  'esprit-de-corps': { nom: 'Esprit de corps', description: 'Rejoindre un clan.', glyphe: '⚑', couleur: '#7a4f9a' },
  marchand: { nom: 'Marchand', description: 'Vendre une carte aux enchères.', glyphe: '₵', couleur: '#f0b43c' },
  'premiere-heure': { nom: 'Première heure', description: 'Inscrit avant décembre 2026.', glyphe: '◷', couleur: '#8c9692' },
}

export const MAX_BADGES_AFFICHES = 3
