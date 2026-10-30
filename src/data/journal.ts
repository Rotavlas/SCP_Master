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
    titre: 'Des confrontations plus lisibles',
    points: [
      'Une partie occupe tout l’écran : plus besoin de faire défiler, et la main ne chevauche plus le bas de page.',
      'Reconfinement : la main de l’IA est sur la table, avec l’effet de chaque carte. Les parties durent jusqu’à 8 tours sur des Sites de 150 points, et une anomalie reconfinée retourne dans la main de son propriétaire.',
      'Dégâts et soins se voient et s’entendent : chiffres qui s’envolent, jauge qui flashe, voile rouge quand votre Site est touché, lueur verte quand il est soigné.',
      'Les Mythiques brillent : aura d’or dans la main, portrait dans la jauge de Manifestation qui reprend ses couleurs, et dans la Brèche, l’ultime joue la cinématique de la carte.',
      'Le Roi écarlate plonge dans les ténèbres dès son prélude : une basse qu’on sent plus qu’on n’entend, un cœur qui bat, et à chaque ligne une voix d’outre-tombe que des chuchotements reprennent de tous côtés. Dans la scène, une fumée noire ronge les bords de l’écran, un murmure de mille voix enfle sous les tambours rituels, les bois qui craquent et les chaînes.',
      'Le Gate Guardian n’a plus rien de rassurant : ses trompettes de l’Apocalypse grondent, sonnent faux et s’effondrent ; l’orgue et le chœur avancent d’accord en accord, voix d’hommes, de femmes puis d’enfants, jusqu’au cri de l’œil qui s’ouvre. Des rayons partent de son œil et des plumes de lumière tombent.',
    ],
  },
  {
    date: '2026-10-30',
    titre: 'Trois façons d’affronter l’IA',
    points: [
      'Dans Confrontation, choisissez votre mode contre l’IA : Reconfinement, Brèche de confinement ou Duel éclair. Chacun a son tutoriel, montré avant la première partie et à tout moment avec « Comment jouer ? ».',
      'Reconfinement : chaque tour, libérez une anomalie chez l’adversaire ou jouez un soutien. Pour arrêter celle qui s’échappe chez vous, reconfinez-la en répondant à une question sur elle, souvent sur ses vraies procédures de confinement.',
      'Les anomalies ont enfin leurs effets : SCP-173 ferme vos paupières et frappe plus fort si vous tardez, SCP-096 est voilé et punit qui le regarde, SCP-055 efface la question, SCP-682 blesse même reconfiné, SCP-106 emporte une carte… Les autres agissent selon leurs tags : réponses brouillées (mémétiques), question qui s’efface (antimémétiques), temps réduit (temporelles), éclairs, tremblements, contagion, hostilité.',
      'Les soutiens aident à reconfiner : une FIM retire une mauvaise réponse (et reconfine d’office un SCP qu’elle a confiné dans le wiki), le personnel donne du temps et dissipe l’effet, un Protocole le neutralise, un Site renforce.',
      'La Manifestation : chaque bon reconfinement remplit une jauge d’or. Pleine, elle libère la Mythique de votre équipe, sa cinématique et son pouvoir : les chaînes du Roi écarlate, Patmos-Omega, la Main droite rouge, le Veto d’O5-1…',
      'Brèche de confinement : un plateau de 3 cellules où l’on pose ses cartes en les glissant ; les SCP font brèche, les FIM et le personnel gardent, les Sites fortifient, les Protocoles affaiblissent. Juste en moins de 7 secondes, vous voyez la carte adverse avant de jouer.',
      'Duel éclair : le quiz classique en cinq manches, troublé par les anomalies de chaque camp ; vous sentez l’effet de la carte adverse avant de la voir.',
      'Le journal quitte les onglets : il est à côté de la cloche, avec un point rouge quand il y a du nouveau.',
    ],
  },
  {
    date: '2026-10-30',
    titre: 'Légendaires plus rares, duels contre l’IA',
    points: [
      'Une Légendaire devient bien plus rare : 0,2 % par carte dans un dossier standard (contre 0,7 %). Les dossiers Keter et O5 baissent dans la même proportion et restent plus généreux.',
      'Contre l’IA : 5 duels récompensés par 24 heures au lieu de 10, avec un compteur à voyants dans l’écran Confrontation. Une fois épuisés, l’entraînement reste possible, sans gains.',
      'Nouvel onglet Journal : tout ce qui a changé depuis l’ouverture.',
      'Les variantes se voient enfin sur les Légendaires et les Mythiques : archive sur papier jauni taché de café, Sceau O5 refait en gravure d’or sur laque noire avec sa médaille frappée « O5 », bandes noires et tampon pour l’expurgée.',
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
