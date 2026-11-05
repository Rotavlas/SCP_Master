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
    date: '2026-11-06',
    titre: 'Le marché vous dit ce qui vous manque',
    points: [
      'Chaque vente aux enchères indique si la carte est « Nouvelle pour vous » ou déjà possédée (combien d’exemplaires, et si la variante en vente vous manque). Un filtre « Cartes que je n’ai pas » ne garde que les nouvelles.',
      'Les codes peuvent offrir n’importe quel dossier, Apollyon compris : ils s’ouvrent depuis l’écran des dossiers, comme le Keter offert. Un code peut aussi donner de l’XP, plusieurs cosmétiques ou des cartes précises.',
    ],
  },
  {
    date: '2026-11-06',
    titre: 'Des pages mieux rangées',
    points: [
      'En combat sur téléphone, une question prend toute la place : plus de petit cadre à faire défiler. Pendant la question, la main, votre carte et les jauges de Manifestation s’effacent, la carte adverse passe en vignette à côté de son effet, et la question vient d’elle-même à l’écran.',
      'Terminal : sur grand écran, deux colonnes, le quotidien à gauche (objectifs, Rapport, missions), la progression à droite (piste, raretés, vitrine).',
      'Confrontation et Intendance passent en onglets : « Entre agents », « Contre l’IA », « Épreuve » d’un côté ; « Dossiers », « Contrats et Mythiques », « Cosmétiques », « Crédits et compte » de l’autre. L’onglet ouvert est retenu.',
      'Archives : un en-tête avec les actions, l’équipe repliée, les filtres de rareté, de type, de classe et de série rangés derrière un bouton « Filtres ».',
      'Favoris en un toucher : une étoile sur chaque carte des Archives, sans ouvrir la fiche.',
      'La fiche d’une carte : les actions (favori, équipe, partager, cinématique) juste sous le nom, et le contenu en onglets : dossier, marché et doublons, registre des Mythiques.',
    ],
  },
  {
    date: '2026-11-06',
    titre: 'Succès, contrats, codes et images à partager',
    points: [
      'Nouvelle page « Succès » : plus de cinquante succès (collection, raretés, variantes, confrontations, marché, Intendance), dont les archives complètes de chaque type de fiche. Les plus durs rapportent un titre ou un cadre de profil, jamais de crédits.',
      'L’album et les collections des Groupes d’intérêt quittent les Archives pour cette page, avec une présentation entièrement revue : un anneau de progression par collection, et la liste des fiches qui manquent en un toucher.',
      'Contrats de l’Intendance : chaque semaine, trois fiches précises (deux rares, une épique) rachetées contre un dossier Keter chacune.',
      'Codes : menu du compte → « Saisir un code », pour les récompenses offertes lors d’événements.',
      'Partager une carte crée maintenant une image (illustration, rareté, variante, numéro, adresse du jeu), depuis le bilan d’un dossier ou la fiche de n’importe quelle carte possédée.',
      'À l’Intendance, les Mythiques en circulation : combien d’exemplaires numérotés sont déjà sortis, lesquelles sont épuisées.',
      'Rareté : les communes et peu communes sortent deux fois moins souvent en variante ; un dossier gratuit toutes les 15 minutes au lieu de 10. Les crédits reçus dans un échange sont taxés à 10 %, comme une vente.',
    ],
  },
  {
    date: '2026-11-05',
    titre: 'Les notifications partent dès qu’on quitte le jeu',
    points: [
      'Une notification n’arrivait pas sur le téléphone pendant les 3 minutes qui suivaient la fermeture du jeu (il vous croyait encore en ligne) : elle part maintenant dès que le jeu n’est plus à l’écran.',
      'Nouveau, dans le menu du compte : « Envoyer une notification d’essai ». Le jeu affiche ce qu’Apple ou Google ont répondu, et met d’abord à jour le terminal installé s’il date d’avant les notifications.',
    ],
  },
  {
    date: '2026-11-05',
    titre: 'La variante Brèche répare son glitch',
    points: [
      'Sur téléphone, les quatre tuiles du Terminal (dossiers, Elo, archives, crédits) passent en 2 × 2 : le reste du Terminal arrive sans défiler un écran entier.',
      'Le ✕ des fiches et des profils se voit enfin sur téléphone : une pastille sombre, au-dessus de la carte.',
      'Quand le serveur ne répond pas, les amis, le clan, les classements, les échanges, le cours d’une carte et les profils ne restent plus bloqués sur « Chargement… » : un bouton Réessayer apparaît.',
      'À l’Intendance, l’aperçu des titres ne coupe plus les mots en morceaux.',
      'Les cartes en variante Brèche restaient « cassées » les trois quarts du temps (en-tête et textes masqués, couleurs inversées) : elles ne glitchent plus que par un bref sursaut, et leurs lignes de balayage défilent de nouveau sur la carte.',
      'Les Mythiques retrouvent leur aura rouge pulsée, et le nom d’une Légendaire en Archive d’origine se lit de nouveau, à l’encre sur le papier jauni.',
      'Vérification des chances des variantes : celles tirées par le serveur sont exactement celles affichées, pour chaque dossier, les Mythiques et la fusion.',
    ],
  },
  {
    date: '2026-11-05',
    titre: 'Registre des Mythiques, fusion, cote, collections, cosmétiques et notifications',
    points: [
      'Chaque Mythique a son registre : la fiche d’une Mythique montre tous ses exemplaires numérotés sortis, leur détenteur actuel et toute leur histoire (tiré d’un dossier par qui, racheté aux enchères à quel prix, échangé, détruit).',
      'Fusion : 5 doublons d’une même carte (en plus de celui qu’on garde) deviennent un exemplaire dans une variante tirée au hasard. Holographique le plus souvent, Sceau O5 presque jamais. Frais : la valeur de recyclage des 5 doublons, 3 fusions par jour, jamais pour une Mythique.',
      'Le marché a sa cote : volume de la semaine, plus fortes hausses et baisses, cartes les plus échangées et records du mois.',
      'Douze collections des Groupes d’intérêt dans les Archives (la Main du Serpent, l’Insurrection du Chaos, MC&D, la Coalition occulte mondiale…) : le Groupe et tous ses documents. Complète, une collection rapporte un titre et un cadre de profil introuvables ailleurs.',
      'Cosmétiques à l’Intendance : titres sous votre pseudo, cadres de profil, couvertures pour les dossiers que vous ouvrez. Sans aucun effet sur le jeu.',
      'Notifications sur l’appareil : surenchère, offre d’échange, vente conclue, message privé… arrivent même le jeu fermé. À activer depuis le Terminal ou le menu du compte (sur iPhone, dans l’application installée).',
    ],
  },
  {
    date: '2026-11-04',
    titre: 'L’application, encore plus à l’aise sur téléphone et tablette',
    points: [
      'Sur téléphone, la fiche d’une carte et le profil d’un agent montent du bas de l’écran comme un panneau : on les ferme en les faisant glisser vers le bas.',
      'Sur iPhone, l’application installée s’ouvre sur un écran de démarrage aux couleurs de la Fondation au lieu d’une page blanche.',
      'Pendant un duel, une Épreuve ou l’ouverture d’un dossier, l’écran ne se met plus en veille.',
      'L’icône de l’application installée affiche une pastille quand des messages, des offres d’échange ou des notifications vous attendent.',
      'Une Légendaire ou une Mythique sortie d’un dossier, ou votre score à l’Épreuve, se partagent d’un geste (Messages, Discord…) ; sur ordinateur, le texte est copié.',
      'Le Terminal propose d’installer l’application (« Plus tard » la fait disparaître). Lancée sans réseau, elle le dit clairement et repart d’elle-même au retour de la connexion.',
      'Sur tablette et petit écran d’ordinateur, les onglets passent sur leur propre ligne sous l’en-tête : tous visibles, plus aucun caché hors de l’écran.',
    ],
  },
  {
    date: '2026-11-04',
    titre: 'Déchirer un dossier',
    points: [
      'Découper le scellé ouvre maintenant une vraie fente en dents de scie derrière les ciseaux : le rabat se décolle, des fibres de papier s’envolent, et sur Android le téléphone vibre à chaque quart.',
      'La lumière qui filtre par la fente trahit la meilleure fiche du dossier : blanche d’ordinaire, violette pour une Épique, dorée pour une Légendaire, à la couleur de la Mythique pour une Mythique.',
      'Quand le scellé cède, le dossier tressaille, le rabat s’arrache et s’envole, un éclair de la même couleur jaillit, et les cinq fiches sortent de l’ouverture en éventail.',
      'Sur iPhone, l’application installée a une barre d’état noire et opaque : l’en-tête ne passe plus sous l’heure et la Dynamic Island, et rien ne transparaît derrière lui.',
    ],
  },
  {
    date: '2026-11-04',
    titre: 'Le jeu sur téléphone, et en application',
    points: [
      'Plus aucun défilement de côté sur téléphone, même sur les plus petits écrans (320 px) : l’en-tête, le Rapport quotidien, les missions, la page Social, la circulaire et l’ouverture des dossiers tiennent dans la largeur.',
      'Sur téléphone, l’en-tête ne garde que l’essentiel : la langue (VO/VF) et le son passent dans le menu « Plus », et le compte devient une pastille avec votre initiale.',
      'Les champs ne font plus zoomer l’iPhone, les boutons sont à la taille d’un doigt, un appui long sur une carte n’ouvre plus le menu de l’image, et tirer l’écran vers le bas en pleine partie ne recharge plus la page.',
      'SCP Masters s’installe comme une application : « Installer l’application » dans le menu du compte (sur iPhone, la marche à suivre dans Safari). Une fois installé, il s’ouvre en plein écran, et un appui long sur son icône propose d’aller droit aux dossiers, aux duels ou aux archives.',
      'L’application démarre plus vite : son code, ses polices et le catalogue sont gardés sur l’appareil. Quand une nouvelle version sort, un bandeau propose de la charger d’un geste.',
      'Sans réseau, un bandeau le signale : le jeu se joue en ligne et reprend dès le retour de la connexion.',
    ],
  },
  {
    date: '2026-11-03',
    titre: 'La circulaire 05-ECO, et le plafond de recyclage bien en vue',
    points: [
      'Nouvelle circulaire de l’Intendance : toutes les règles de l’économie sur une seule page. Prix et limites des dossiers, chances de chaque rareté, Mythiques et variantes, barème du recyclage et du brûlage, taxe du marché, gains des confrontations, primes (Rapport, Épreuve, album, missions, piste, raid) et clans. Elle s’ouvre depuis l’Intendance, les Archives et « Comment jouer ».',
      'En tête de la circulaire, vos quotas du jour se remplissent en direct : dossiers Keter, O5 et Apollyon encore achetables, dossiers en réserve.',
      'Le plafond du recyclage et du brûlage a sa jauge : trente crans de 100 ₵ qui s’éteignent à mesure qu’on recycle ou brûle, orange quand il en reste peu, rouge une fois atteint. Elle s’affiche dans les Archives, sur la fiche d’une carte, au marché et dans la circulaire.',
      'Au marché, le bouton « Brûler un exemplaire » annonce désormais le gain réel, plafond du jour compris (il affichait la valeur pleine même une fois le plafond atteint).',
    ],
  },
  {
    date: '2026-11-03',
    titre: 'Les Mythiques : numéros, Première édition et variantes',
    points: [
      'Chaque Mythique porte une plaque discrète « N° 07/50 » : à l’ouverture du dossier, dans les archives, dans l’équipe et sur l’accueil. Avec plusieurs exemplaires, c’est le plus petit numéro qui s’affiche. Sa fiche liste tous vos exemplaires.',
      'Les exemplaires n° 1 à 5 de chaque Mythique forment sa Première édition : la mention sur la plaque et un filet d’or dans le cadre.',
      'Les Mythiques ont désormais leurs variantes. Deux n’existent que pour elles : Négatif (la scène inversée, comme sur la pellicule d’une caméra de confinement) et Épreuve d’artiste (la scène au crayon, sur papier). Les variantes ordinaires (holographique, expurgée, archive, brèche, sceau O5) leur sont aussi ouvertes.',
      'Une variante ne crée aucun exemplaire de plus : le numéro (1 à 50) est commun à toutes les variantes d’une Mythique.',
    ],
  },
  {
    date: '2026-11-03',
    titre: 'Un terminal plus vivant',
    points: [
      'Au premier passage de la visite, le Terminal se déverrouille : le salut se tape lettre à lettre, la jauge d’accréditation se remplit, les tiroirs sortent l’un après l’autre.',
      'Les crédits défilent jusqu’à leur nouvelle valeur, dans le bandeau comme sur l’accueil, et l’écart s’envole à côté (+120, −350). Le stock de dossiers aussi.',
      'Une mission, une page d’album ou un rapport du jour réclamés reçoivent leur tampon « Reçu ».',
      'Ce qui charge s’affiche caviardé plutôt que de laisser un trou : la page ne saute plus à l’arrivée des données.',
      'Changer d’écran rafraîchit le terminal (un balayage lumineux), et les sections du Terminal se déplient quand on les ouvre.',
      'Les appareils réglés pour réduire les animations n’en ont aucune.',
    ],
  },
  {
    date: '2026-11-03',
    titre: 'Correctifs : raids, ouverture des dossiers',
    points: [
      'Raid de clan : une anomalie reconfinée le reste, même si un membre quitte ensuite le clan (la récompense pouvait redevenir inaccessible aux autres).',
      'Raid de clan : seuls comptent les coups portés jusqu’à la chute de l’anomalie ; rejoindre un clan déjà victorieux ne permet plus de réclamer sa part sans avoir contribué.',
      'Ouverture des dossiers : recharger la page en pleine ouverture ne fait plus perdre la révélation. Le dossier reprend là où il en était, Mythique comprise.',
      'Ouverture des dossiers : avec « Tout voir », une cinématique ne recommence plus d’elle-même en cours de route, et un double clic ne saute plus la suivante.',
      'Reconfinement : quand l’IA déclenche son Protocole d’urgence, il s’affiche aussi sur le plateau.',
      'L’album se calcule plus vite (les pages sont composées d’avance).',
    ],
  },
  {
    date: '2026-11-02',
    titre: 'Les Manifestations frappent sur le plateau',
    points: [
      'En Reconfinement, une Manifestation ne coupe plus la partie par sa cinématique : la Mythique frappe directement sur le plateau, en quelques secondes, en accord avec son effet.',
      'Les chaînes du Roi écarlate jaillissent des bords de l’écran et ligotent le Site adverse ; l’épée enflammée du Gate Guardian le fend sous ses ailes de lumière ; SCP-173 se rapproche à chaque clignement ; SCP-2747 rature la page et l’efface ; O5-1 appose son VETO ; la Main droite rouge se lève sur votre Site ; l’Administrateur le réécrit ; la photo de Siegel s’y développe.',
      'En duel entre agents, la Manifestation adverse frappe votre Site de la même façon. Les cinématiques complètes restent visibles à l’ouverture des dossiers et depuis la fiche de chaque Mythique.',
      'Le Terminal se range en sections rétractables (À portée de main, Rapport et missions, Progression, Vitrine, Comment jouer) : chacune garde son état d’une visite à l’autre, et son badge reste visible fermée.',
    ],
  },
  {
    date: '2026-11-02',
    titre: 'Des Mythiques vraiment rares, et un rapport à remettre chaque jour',
    points: [
      'Chaque Mythique n’existe plus qu’en 50 exemplaires numérotés, pour toute la vie du jeu. Une fois son édition épuisée, elle ne sort plus des dossiers (une Légendaire sort à sa place) et ne s’obtient plus qu’au marché. Une Mythique brûlée est perdue pour toujours. La fiche de chaque Mythique indique combien d’exemplaires sont déjà sortis.',
      'Rapport quotidien, sur l’accueil : une récompense par jour sur un cycle de sept, et le septième jour un dossier Keter offert. Un seul jour manqué et la série repart du premier jour.',
      'Piste d’accréditation : trente paliers d’XP, chacun avec sa récompense (crédits, un dossier tous les trois paliers, un dossier Keter tous les dix). Les paliers atteints se réclament d’un coup.',
      'Les dossiers Keter offerts s’ouvrent depuis la réserve et ne comptent pas dans la limite d’achat du jour.',
      'Sur l’accueil, « À portée de main » : ce qui vous attend ou ce qui est presque atteint (rapport, paliers, pages d’album, part du raid, missions, Épreuve).',
      'Fil du clan : Légendaires et Mythiques obtenues, victoires, Épreuves, pages d’album, raids et arrivées des sept derniers jours, dans la page du clan.',
    ],
  },
  {
    date: '2026-11-02',
    titre: 'Un chargement trois fois plus léger',
    points: [
      'Le jeu charge désormais environ 1,2 Mo au lieu de près de 4 : les extraits des dossiers (description, procédures) ne se téléchargent plus qu’à l’ouverture d’une fiche, quelques kilo-octets à la fois. Le premier écran arrive plus vite, surtout sur mobile.',
      'Épreuve de la semaine : les questions restent les mêmes pour tous, mais l’ordre des réponses change d’un agent à l’autre. Se souffler « la C » ne sert plus à rien.',
      'La cloche annonce le résultat de l’Épreuve le lundi, celui de la saison classée en début de mois, et prévient tout le clan quand l’anomalie du raid est reconfinée.',
    ],
  },
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
