/**
 * Le journal des modifications, du plus récent au plus ancien : ce qui a changé dans le jeu, jour par jour,
 * écrit pour les joueurs. À compléter à chaque mise en ligne.
 */
export interface Entree {
  /** Date de mise en ligne (AAAA-MM-JJ) */
  date: string
  titre: string
  points: string[]
}

export const JOURNAL: Entree[] = [
  {
    date: '2026-10-30',
    titre: 'Légendaires plus rares, duels contre l’IA',
    points: [
      'Une Légendaire devient bien plus rare : 0,2 % par carte dans un dossier standard (contre 0,7 %). Les dossiers Keter et O5 baissent dans la même proportion et restent plus généreux.',
      'Contre l’IA : 5 duels récompensés par 24 heures au lieu de 10, avec un compteur à voyants dans l’écran Confrontation. Une fois épuisés, l’entraînement reste possible, sans gains.',
      'Nouvel onglet Journal : tout ce qui a changé depuis l’ouverture.',
      'Les variantes se voient enfin sur les Légendaires et les Mythiques : archive sur papier jauni taché de café, Sceau O5 qui passe l’image à l’or avec un sceau de cire, bandes noires et tampon pour l’expurgée.',
      'Recycler ou brûler ses doublons garde toujours un exemplaire standard : une variante ne compte plus comme l’exemplaire gardé.',
      'Archives : nouveaux filtres en pastilles (raretés et types à choix multiples, avec leur nombre), filtre par variante, tri inversable, réinitialisation, et filtres retenus d’une visite à l’autre.',
      'SCP-173 est recadrée sur la statue.',
    ],
  },
  {
    date: '2026-10-29',
    titre: 'Le son, et le jeu sur téléphone',
    points: [
      'Le jeu a du son, entièrement fabriqué dans le navigateur : sceau de cire et papier qui se déchire à l’ouverture d’un dossier, cartes qui claquent, clochettes selon la rareté, machine à écrire et tampon des Légendaires.',
      'Chaque Mythique a son ambiance : brasier et chaînes du Roi écarlate, chœur du Gate Guardian, sirène et pas d’Alpha-1, orgue de l’Administrator, moniteur d’O5-1, chambre noire de Siegel, néon de SCP-173…',
      'Un bouton 🔊 en haut coupe ou rétablit le son ; le choix reste sur l’appareil.',
      'Version téléphone : onglets en bas de l’écran (et « Plus » pour le reste), en-tête d’une ligne, filtres compacts, duels lisibles sans défiler.',
      'Le jeu s’installe sur l’écran d’accueil d’un téléphone et s’ouvre en plein écran, comme une application.',
    ],
  },
  {
    date: '2026-10-28',
    titre: 'Les Mythiques prennent vie',
    points: [
      'Les Mythiques reprennent les illustrations de SunnyClockwork (et la vraie photo d’Aaron Siegel, yeux caviardés) : la carte au repos vit en boucle, yeux qui clignent, braises, cœur qui bat.',
      'Cinématiques immersives en plein écran : l’illustration se construit devant vous (les bois du Roi écarlate qui se ramifient, ses chaînes maillon par maillon, le Gate Guardian qui sort d’une porte de lumière, Alpha-1 au bout d’un couloir de soldats, O5-1 dessiné depuis ses câbles), puis revient se ranger dans la carte.',
      'Avant chaque Mythique, un prélude la fait deviner sans la nommer, avec sa police et son indice visuel ; Les Auteurs brisent le quatrième mur.',
      'Nouvelles Mythiques : SCP-173 (on cligne, elle se rapproche) et SCP-2747, l’anafabula, qui efface la page qui la raconte.',
      'Les Légendaires ont leur dossier entrouvert : nature, date, auteur, puis un extrait caviardé qui se décrypte à moitié.',
      'Raretés : Alison Chao (la Reine Noire), tout le Conseil O5 et les grandes entités passent Légendaires.',
      'Nouveau type de cartes, les Protocoles : ordre d’urgence Patmos, Procédure 110-Montauk, Initiatives de Réponse Automatisée (IRA-1 à 7), codes de confinement, scénarios de classe K.',
      'Un bouton « Revoir la cinématique » dans la fiche des Légendaires et des Mythiques obtenues.',
      'Version française complète des cartes, cloche de notifications (marché, enchères, souhaits), cadre pleine page des Légendaires.',
    ],
  },
  {
    date: '2026-10-27',
    titre: 'Le jeu à plusieurs',
    points: [
      'Classements, profils, amis, clans, messagerie et duels entre joueurs, avec leur Elo.',
      'Historique des mises et meneur de chaque enchère.',
      'Nouvelle rareté Mythique, au-dessus de Légendaire, avec sa cinématique ; nouveaux types de cartes : départements, entités, Sites et propositions pour SCP-001.',
      'Badges de profil à obtenir, affichés à côté du pseudo ; un dossier scellé à découper pour chaque ouverture.',
    ],
  },
  {
    date: '2026-10-26',
    titre: 'Ouverture du site',
    points: [
      'SCP Masters en ligne : plus de 17 000 dossiers du wiki SCP en cartes, à ouvrir par dossiers de cinq.',
      'Connexion avec Discord (ou par un lien envoyé par e-mail), collection enregistrée sur le serveur.',
      'Duels contre l’IA, arbitrés par le serveur : il faut connaître ses dossiers.',
      'Marché en direct, cours des cartes, échanges entre joueurs et brûlage des doublons.',
    ],
  },
]
