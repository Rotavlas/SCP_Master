/**
 * Le glossaire du jeu : chaque notion expliquée en quelques phrases. Le « ? » à côté d'une notion (src/components/
 * Aide.tsx) en ouvre l'entrée ; le Règlement les reprend toutes.
 */
export interface EntreeAide {
  titre: string
  texte: string
}

export const AIDE = {
  raretes: {
    titre: 'Raretés',
    texte:
      'Commune, peu commune, rare, épique, légendaire, mythique : plus une fiche est rare, moins elle sort des dossiers et plus elle frappe fort. Les Mythiques n’existent qu’en 50 exemplaires numérotés.',
  },
  variantes: {
    titre: 'Variantes',
    texte:
      'Une même carte peut sortir en version holographique, expérimentale, d’archive, Brèche ou O5. Elles sont rares (moins encore sur les cartes communes) et se fusionnent : cinq doublons d’une carte donnent une variante.',
  },
  synergies: {
    titre: 'Synergies d’équipe',
    texte:
      'Des cartes de l’équipe qui ont un point commun (une FIM liée à l’un de vos SCP, une même série, un même thème, des numéros qui se suivent…) donnent 2 secondes de plus pour répondre contre l’IA, deux synergies au plus. Les synergies d’exception, en or, ont leur effet propre ; une seule compte. Ni en JcJ ni à l’Épreuve.',
  },
  accreditation: {
    titre: 'Accréditation',
    texte:
      'Votre rang à la Fondation, du niveau 0 au niveau 5, selon votre expérience (XP). Chaque niveau ouvre un adversaire de plus contre l’IA ; le niveau 5 donne le titre « Thaumiel ».',
  },
  etats: {
    titre: 'États de service',
    texte:
      'Trente paliers d’expérience, bien au-delà du niveau 5. Chacun se réclame contre des crédits, un dossier tous les trois paliers, un dossier Keter tous les dix.',
  },
  protocoles: {
    titre: 'Protocoles et Manifestation',
    texte:
      'En Reconfinement, vos bonnes réponses remplissent la jauge de Manifestation ; pleine, votre Mythique se manifeste et frappe. Les Protocoles sont des fiches de consignes : elles soignent, protègent ou désorganisent l’adversaire.',
  },
  epreuve: {
    titre: 'Épreuve de la semaine',
    texte:
      'Dix questions, les mêmes pour tous les agents, une seule tentative par semaine. Le classement se clôt le lundi : les meilleurs gagnent des crédits.',
  },
  raid: {
    titre: 'Raid de clan',
    texte:
      'Chaque semaine, une anomalie Keter à reconfiner avec votre clan : vos duels et votre Épreuve l’entament. Si elle tombe avant lundi, chaque membre qui a assez contribué réclame sa part.',
  },
  guerre: {
    titre: 'Guerre de clans',
    texte:
      'Chaque semaine, votre clan affronte un autre clan tiré au sort. Victoire contre l’IA 1 point, entre agents 3, Épreuve terminée 2. La victoire s’inscrit au dossier de ceux qui ont marqué.',
  },
  rapport: {
    titre: 'Rapport quotidien',
    texte: 'Une petite récompense par jour, plus belle à mesure que la série s’allonge ; un jour manqué et la série repart de zéro.',
  },
  cote: {
    titre: 'Cote du marché',
    texte: 'Le prix moyen des dernières ventes d’une carte (et de chaque variante), pour savoir ce qu’elle vaut avant d’acheter ou de vendre.',
  },
  recyclage: {
    titre: 'Recyclage',
    texte:
      'Les doublons se recyclent contre des crédits (un exemplaire standard est toujours gardé). Au-delà de 3 000 ₵ dans la journée, le recyclage ne rapporte plus que 20 %.',
  },
  contrats: {
    titre: 'Contrats',
    texte: 'Chaque semaine, l’Intendance rachète trois fiches précises (deux rares, une épique), chacune contre un dossier Keter.',
  },
  initiative: {
    titre: 'Initiative',
    texte: 'Répondre juste et vite donne l’initiative : au tour suivant, vous voyez le coup de l’adversaire avant de choisir le vôtre.',
  },
  ambiances: {
    titre: 'Ambiances',
    texte: 'Les fonds sonores des scènes de Mythiques et des combats (sirènes, chœurs, machines). Leur volume se règle à part des bruitages.',
  },
} satisfies Record<string, EntreeAide>

export type SujetAide = keyof typeof AIDE
