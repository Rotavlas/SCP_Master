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
    date: '2026-11-02',
    titre: 'L’Épreuve de la semaine et les raids de clan',
    points: [
      'Nouveau dans le hall des confrontations : l’Épreuve de la semaine. Dix questions, les mêmes pour tous les agents, des anomalies célèbres aux dossiers oubliés ; une seule tentative, 100 points par bonne réponse et jusqu’à 50 de plus selon la vitesse.',
      'Le classement se fige le lundi : 1 500 ₵ au premier, 1 000 ₵ aux deux suivants, 500 ₵ jusqu’au dixième, 100 ₵ pour tous les autres. À score égal, le plus rapide passe devant.',
      'Raids de clan : chaque semaine, une anomalie Keter (SCP-682, SCP-096, SCP-106…) à reconfiner ensemble. Chaque duel des membres l’entame, l’Épreuve aussi, au plus 150 par agent et par jour.',
      'Si elle tombe avant lundi, chaque membre qui a infligé au moins 40 réclame 500 ₵ et un dossier, depuis la page du clan.',
    ],
  },
  {
    date: '2026-11-02',
    titre: 'Une économie plus serrée, et le Dossier Apollyon',
    points: [
      'Les dossiers Keter s’achètent trois fois par jour, les Archives du Conseil O5 une fois par jour ; le compteur repart à minuit (heure de Paris). L’Intendance indique combien il en reste.',
      'Nouveau : le Dossier Apollyon, au-dessus d’O5. 4 000 ₵, un seul par semaine (renouvelé le lundi) : cinq fiches épiques ou mieux, une Légendaire garantie, variantes ×6 et des Mythiques bien plus probables.',
      'Recycler et brûler rapporte au plus 3 000 ₵ par jour à plein tarif ; au-delà, 20 % de la valeur. Les gains annoncés en tiennent compte.',
      'La taxe du marché passe à 10 % de chaque vente.',
      'Missions : chaque jour, trois missions tirées pour vous (ouvrir des dossiers, gagner contre l’IA, enchaîner les bonnes réponses, jouer un duel entre agents, recycler, vendre), et chaque semaine trois plus longues. La progression se suit sur l’accueil ; crédits et dossiers se réclament une fois l’objectif atteint.',
      'Les dossiers gratuits et les autres dossiers ne sont pas limités.',
      'De nouvelles anomalies ont leur effet : SCP-939 imite (une fausse réponse copie presque la bonne), SCP-087 plonge la question dans le noir (on ne la lit qu’à la lueur de sa lampe), SCP-2521 transforme l’intitulé en points, SCP-3000 dévore la mémoire, SCP-3008 égare les réponses, SCP-035 possède, MalO apparaît du coin de l’œil ; les propositions pour SCP-001 font vaciller la réalité.',
      'Les Protocoles ont leur pouvoir en Reconfinement : IRA-5 reconfine d’office, CODE RED divise la brèche par quatre, CODE GREEN décontamine, CODE AMBER donne du temps, Montauk vide la jauge adverse, Patmos reconfine d’office les deux tours suivants, CK soigne, XK frappe les deux Sites.',
      'Saisons classées : chaque mois est une saison. Les agents qui y jouent au moins 5 duels classés sont récompensés à la clôture selon leur Elo (Or dès 1 300 : 2 500 ₵ ; Argent dès 1 150 : 1 200 ₵ ; Bronze dès 1 050 : 600 ₵ ; sinon 200 ₵), puis tous les Elo se rapprochent de moitié de 1 000. Le hall des duels montre la saison en cours et votre dernier résultat.',
      'L’album de la Fondation, dans les Archives : neuf pages à compléter (Conseil O5, IRA, codes de confinement, scénarios K, grandes entités, départements, Sites, FIM, Mythiques). Une page complète se réclame une fois, de 600 ₵ à 10 000 ₵.',
      'Les Auteurs ont leur musique : un piano qui semble vous remarquer, un « toi » chuchoté, une notification quand ils prennent votre onglet, le silence au plantage, puis la musique qui revient pendant qu’ils écrivent la carte.',
    ],
  },
  {
    date: '2026-10-30',
    titre: 'L’anafabula efface son propre récit',
    points: [
      'La cinématique de SCP-2747 est entièrement refaite : un vrai conte s’écrit à la plume sur un parchemin enluminé, à la lueur d’une bougie, sur une harpe et une voix qui fredonne.',
      'Puis la page bégaie (« Celui-ci aussi. »), se rature en rouge, et les flèches noires la déchirent ; la dame apparaît, ses ronces dévorent le texte ligne après ligne, la couronne se pose.',
      'Enfin le silence : la page s’efface et blanchit, une dernière ligne s’écrit — « Cette carte en est un. » — et s’efface à son tour, touche après touche.',
    ],
  },
  {
    date: '2026-10-30',
    titre: 'Le Reconfinement entre joueurs',
    points: [
      'Les duels classés et amicaux se jouent désormais en Reconfinement : chacun pose sa carte en secret, les deux sont révélées ensemble, puis chacun reconfine l’anomalie que l’autre a libérée chez lui. Mains sur la table, effets du lore, et la Manifestation des Mythiques, que les deux joueurs voient se déchaîner.',
      '« Tout voir » à l’ouverture d’un dossier ne saute plus les Légendaires et les Mythiques : leurs cinématiques se jouent d’abord, puis le bilan.',
      'Toutes les cinématiques Mythiques ont maintenant leur musique : la marche au pas d’Alpha-1 sous la sirène, l’orgue et la plume de l’Administrator, le respirateur et le bip plat d’O5-1 avant que son cœur reparte, la boîte à musique de la chambre noire de Siegel, le cœur qui s’emballe face à SCP-173, le chœur étrange de l’anafabula qui s’éteint avec la page.',
    ],
  },
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
