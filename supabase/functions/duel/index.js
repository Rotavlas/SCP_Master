const ADVERSAIRES = [
	{
		niveau: 1,
		nom: "D-9341",
		titre: "Personnel de Classe D",
		precision: .45,
		poids: [
			.8,
			.2,
			0,
			0,
			0
		],
		vitesse: [8, 18],
		gain: 40,
		xp: 40,
		accreditation: 0
	},
	{
		niveau: 2,
		nom: "Agent Lambert",
		titre: "Force d'intervention mobile Epsilon-11",
		precision: .6,
		poids: [
			.45,
			.4,
			.15,
			0,
			0
		],
		vitesse: [6, 15],
		gain: 60,
		xp: 60,
		accreditation: 1
	},
	{
		niveau: 3,
		nom: "Dr Valois",
		titre: "Chercheur principal, Site-19",
		precision: .72,
		poids: [
			.15,
			.45,
			.3,
			.1,
			0
		],
		vitesse: [5, 13],
		gain: 85,
		xp: 90,
		accreditation: 2
	},
	{
		niveau: 4,
		nom: "Directrice Okafor",
		titre: "Directrice du Site-17",
		precision: .82,
		poids: [
			0,
			.3,
			.4,
			.25,
			.05
		],
		vitesse: [4, 11],
		gain: 120,
		xp: 130,
		accreditation: 3
	},
	{
		niveau: 5,
		nom: "O5-█",
		titre: "Conseil O5",
		precision: .9,
		poids: [
			0,
			0,
			.35,
			.45,
			.2
		],
		vitesse: [3, 9],
		gain: 180,
		xp: 200,
		accreditation: 4
	}
];
function deckAdversaire(base, adversaire) {
	const deck = [];
	while (deck.length < 5) {
		let x = Math.random();
		let rarete = 0;
		while (rarete < 4 && (x -= adversaire.poids[rarete]) >= 0) rarete++;
		const carte = base.auHasard(rarete);
		if (!deck.some((c) => c.id === carte.id)) deck.push(carte);
	}
	return deck;
}
/** Réponse simulée de l'adversaire : index choisi et temps mis. */
function reponseAdversaire(adversaire, question) {
	const precision = Math.max(.2, adversaire.precision - question.difficulte * .08);
	const [min, max] = adversaire.vitesse;
	const temps = Math.min(19.5, min + Math.random() * (max - min));
	if (Math.random() < precision) return {
		choix: question.bonne,
		temps
	};
	const mauvaises = question.options.map((_, i) => i).filter((i) => i !== question.bonne);
	return {
		choix: mauvaises[Math.floor(Math.random() * mauvaises.length)],
		temps
	};
}
/**
* Dégâts infligés quand on répond juste : la Menace de sa carte contre le Confinement
* de la carte adverse, avec un bonus si l'on répond vite ou plus vite que l'adversaire.
*/
function degats(attaquant, defenseur, temps, plusRapide) {
	const base = attaquant.atk * .8 - defenseur.def * .32;
	const vitesse = temps < 20 / 3 ? 1.25 : 1;
	const course = plusRapide ? 1.15 : 1;
	return Math.max(8, Math.round(base * vitesse * course));
}
const FAMILLES = [
	{
		tags: ["antimemetic"],
		effet: {
			id: "antimemetique",
			nom: "Antimémétique",
			icone: "◌",
			texte: "La question s’efface de votre mémoire au bout de 3 secondes.",
			alteration: "antimemetique"
		}
	},
	{
		tags: [
			"memetic",
			"cognitohazard",
			"infohazard",
			"mind-affecting",
			"compulsion",
			"memory-affecting"
		],
		effet: {
			id: "memetique",
			nom: "Mémétique",
			icone: "≋",
			texte: "Les réponses se brouillent sous vos yeux.",
			alteration: "memetique"
		}
	},
	{
		tags: [
			"temporal",
			"loop",
			"predictive"
		],
		effet: {
			id: "temporel",
			nom: "Temporel",
			icone: "⧗",
			texte: `Le temps file : 12 secondes pour répondre.`,
			alteration: "temporel"
		}
	},
	{
		tags: [
			"reality-bending",
			"probability",
			"ectoentropic"
		],
		effet: {
			id: "realite",
			nom: "Altération de la réalité",
			icone: "⟁",
			texte: "La réalité vacille : deux réponses échangent leur place.",
			alteration: "realite"
		}
	},
	{
		tags: [
			"teleportation",
			"portal",
			"spatial",
			"extradimensional"
		],
		effet: {
			id: "spatial",
			nom: "Spatial",
			icone: "⤧",
			texte: "Les réponses se téléportent pendant que vous lisez.",
			alteration: "spatial"
		}
	},
	{
		tags: [
			"contagion",
			"biohazard",
			"parasitic",
			"self-replicating",
			"airborne",
			"transmission"
		],
		effet: {
			id: "contagion",
			nom: "Contagion",
			icone: "☣",
			texte: "En cas de brèche, le Site perd 4 points à chaque tour suivant.",
			poison: 4
		}
	},
	{
		tags: [
			"hostile",
			"predatory",
			"k-class-scenario",
			"weapon"
		],
		effet: {
			id: "hostile",
			nom: "Hostile",
			icone: "⚔",
			texte: "Sa brèche frappe une fois et demie plus fort.",
			force: 1.5
		}
	},
	{
		tags: [
			"self-repairing",
			"indestructible",
			"adaptive",
			"regeneration",
			"reanimation"
		],
		effet: {
			id: "tenace",
			nom: "Indestructible",
			icone: "⛊",
			texte: "Même reconfinée, elle inflige 40 % de ses dégâts.",
			tenace: .4
		}
	},
	{
		tags: [
			"visual",
			"light",
			"observational",
			"hallucination"
		],
		effet: {
			id: "visuel",
			nom: "Visuel",
			icone: "✺",
			texte: "Des éclairs aveuglants traversent la question.",
			alteration: "visuel"
		}
	},
	{
		tags: [
			"auditory",
			"acoustic",
			"musical",
			"audio"
		],
		effet: {
			id: "sonore",
			nom: "Sonore",
			icone: "♪",
			texte: "Un son insoutenable fait trembler la question.",
			alteration: "sonore"
		}
	}
];
/** Les grandes figures, écrites à la main */
const SIGNATURES = {
	"scp-173": {
		id: "scp-173",
		nom: "Ne clignez pas",
		icone: "◉",
		texte: "L’écran se ferme par instants. Plus vous tardez à répondre, plus il frappe fort.",
		alteration: "clignement",
		special: "lent"
	},
	"scp-096": {
		id: "scp-096",
		nom: "Ne regardez pas",
		icone: "◐",
		texte: "Son image est voilée. La regarder aide à répondre, mais une erreur après l’avoir vu triple ses dégâts.",
		alteration: "visage",
		special: "visage"
	},
	"scp-682": {
		id: "scp-682",
		nom: "Adaptation",
		icone: "⛊",
		texte: "Il s’adapte : même reconfiné, il inflige 60 % de ses dégâts.",
		force: 1.3,
		tenace: .6
	},
	"scp-055": {
		id: "scp-055",
		nom: "Ce que ce n’est pas",
		icone: "◌",
		texte: "Il est antimémétique : l’intitulé de la question n’apparaît jamais.",
		alteration: "effacement"
	},
	"scp-106": {
		id: "scp-106",
		nom: "Dimension de poche",
		icone: "◼",
		texte: "En cas de brèche, il emporte une carte de la main adverse.",
		special: "poche"
	},
	"scp-049": {
		id: "scp-049",
		nom: "Le remède",
		icone: "✚",
		texte: "En cas de brèche, il « soigne » : votre Site regagne 15 points.",
		special: "remede"
	},
	"scp-999": {
		id: "scp-999",
		nom: "Chatouilles",
		icone: "♥",
		texte: "Inoffensif : il ne fait aucun dégât, mais votre Site regagne 20 points.",
		special: "inoffensif"
	},
	"scp-3000": {
		id: "scp-3000",
		nom: "Anantashesha",
		icone: "◌",
		texte: "Elle dévore la mémoire : la question s’efface au bout de 3 secondes, et sa brèche frappe fort.",
		alteration: "antimemetique",
		force: 1.6
	},
	"scp-939": {
		id: "scp-939",
		nom: "Mille voix",
		icone: "❝",
		texte: "Elle imite : une des fausses réponses copie presque la bonne, à une lettre près.",
		alteration: "echo"
	},
	"scp-3008": {
		id: "scp-3008",
		nom: "Magasin infini",
		icone: "⤧",
		texte: "Les réponses se perdent dans les rayons ; même reconfiné, il garde 30 % de sa brèche.",
		alteration: "spatial",
		tenace: .3
	},
	"scp-087": {
		id: "scp-087",
		nom: "L’escalier",
		icone: "◑",
		texte: "Le noir complet : on ne lit la question qu’à la lueur de sa lampe (la souris, le doigt).",
		alteration: "obscurite"
	},
	"scp-2521": {
		id: "scp-2521",
		nom: "●●|●●●●●|●●|●",
		icone: "●",
		texte: "Il prend tout ce qu’on écrit sur lui : l’intitulé de la question devient des points.",
		alteration: "pictogrammes"
	},
	"scp-1471": {
		id: "scp-1471",
		nom: "MalO",
		icone: "◧",
		texte: "Elle apparaît du coin de l’œil : des éclairs traversent la question.",
		alteration: "visuel",
		force: 1.2
	},
	"scp-035": {
		id: "scp-035",
		nom: "Masque possessif",
		icone: "☍",
		texte: "Il possède : les réponses se brouillent, et même reconfiné il inflige 50 %.",
		alteration: "memetique",
		tenace: .5
	},
	"scp-2747": {
		id: "scp-2747",
		nom: "Anafabula",
		icone: "¶",
		texte: "Elle efface la page qui la raconte : l’intitulé de la question disparaît.",
		alteration: "effacement"
	},
	"entite:scarlet-king": {
		id: "scarlet-king",
		nom: "Le Roi écarlate",
		icone: "♛",
		texte: "Ses chaînes frappent deux fois plus fort.",
		force: 2
	}
};
const SANS_EFFET = {
	id: "aucun",
	nom: "Sans effet notable",
	icone: "·",
	texte: "Elle ne compte que sur sa Menace."
};
/** Les propositions pour SCP-001 : des vérités fondatrices */
const PROPOSITION_001 = {
	id: "proposition-001",
	nom: "Proposition 001",
	icone: "✶",
	texte: "Une vérité fondatrice : la réalité vacille, et sa brèche frappe plus fort.",
	alteration: "realite",
	force: 1.4
};
function effetDe(c) {
	const signature = SIGNATURES[c.id];
	if (signature) return signature;
	if (c.s === 0 && (c.k ?? "s") === "s") return PROPOSITION_001;
	const tags = new Set(c.t ?? []);
	return FAMILLES.find((f) => f.tags.some((t) => tags.has(t)))?.effet ?? SANS_EFFET;
}
/**
* SCP-939 imite : une réponse presque identique à la bonne, deux lettres voisines échangées dans son plus long
* mot (ou une lettre doublée s'il est trop court).
*/
function imiter(texte) {
	const mots = texte.split(" ");
	let i = 0;
	mots.forEach((m, k) => {
		if (m.length > mots[i].length) i = k;
	});
	const m = mots[i];
	if (m.length >= 4) {
		const j = 1 + Math.floor(Math.random() * (m.length - 3));
		mots[i] = m.slice(0, j) + m[j + 1] + m[j] + m.slice(j + 2);
	} else mots[i] = m + m.slice(-1);
	const copie = mots.join(" ");
	return copie === texte ? `${texte} ` : copie;
}
/** Remplace une mauvaise réponse par l'imitation de la bonne (les autres options ne bougent pas) */
function appliquerEcho(options, bonne, retirees = []) {
	const candidates = options.map((_, i) => i).filter((i) => i !== bonne && !retirees.includes(i));
	if (!candidates.length) return options;
	const cible = candidates[Math.floor(Math.random() * candidates.length)];
	return options.map((o, i) => i === cible ? imiter(options[bonne]) : o);
}
// src/data/catalogue.ts
const RARETES$1 = [
	{
		nom: "Commune",
		couleur: "#9aa3a8"
	},
	{
		nom: "Peu commune",
		couleur: "#5fbf7f"
	},
	{
		nom: "Rare",
		couleur: "#4a9dff"
	},
	{
		nom: "Épique",
		couleur: "#b26bff"
	},
	{
		nom: "Légendaire",
		couleur: "#f4b740"
	},
	{
		nom: "Mythique",
		couleur: "#ff3b5c"
	}
];
const CLASSES$1 = {
	safe: {
		nom: "Safe",
		couleur: "#3fa66b"
	},
	euclid: {
		nom: "Euclid",
		couleur: "#e3b23c"
	},
	keter: {
		nom: "Keter",
		couleur: "#d64033"
	},
	thaumiel: {
		nom: "Thaumiel",
		couleur: "#3b6fd8"
	},
	apollyon: {
		nom: "Apollyon",
		couleur: "#8b0f1e"
	},
	neutralized: {
		nom: "Neutralized",
		couleur: "#7d8589"
	},
	explained: {
		nom: "Explained",
		couleur: "#5d8aa8"
	},
	decommissioned: {
		nom: "Decommissioned",
		couleur: "#6b5a4a"
	},
	pending: {
		nom: "Pending",
		couleur: "#b8b8b8"
	},
	"esoteric-class": {
		nom: "Esoteric",
		couleur: "#9b59b6"
	}
};
const TYPES = {
	s: {
		nom: "SCP",
		pluriel: "SCP",
		court: "SCP",
		couleur: "#c0392b",
		article: "quel SCP"
	},
	f: {
		nom: "Équipe FIM",
		pluriel: "Équipes FIM",
		court: "FIM",
		couleur: "#2e7d6b",
		article: "quelle équipe FIM"
	},
	p: {
		nom: "Personnel",
		pluriel: "Personnel",
		court: "Personnel",
		couleur: "#4b5d7a",
		article: "qui"
	},
	e: {
		nom: "Département",
		pluriel: "Départements",
		court: "Dépt",
		couleur: "#5b6b3a",
		article: "quel département"
	},
	l: {
		nom: "Site",
		pluriel: "Sites",
		court: "Site",
		couleur: "#3a5f73",
		article: "quel site"
	},
	o: {
		nom: "Protocole",
		pluriel: "Protocoles",
		court: "Protocole",
		couleur: "#8c2f39",
		article: "quel protocole"
	},
	g: {
		nom: "Groupe d'intérêt",
		pluriel: "Groupes d'intérêt",
		court: "GdI",
		couleur: "#7a4f9a",
		article: "quel Groupe d'intérêt"
	},
	n: {
		nom: "Canon",
		pluriel: "Canons",
		court: "Canon",
		couleur: "#a0522d",
		article: "quel canon"
	},
	d: {
		nom: "Document de GdI",
		pluriel: "Documents de GdI",
		court: "Doc. GdI",
		couleur: "#4f6f9a",
		article: "quel document"
	},
	c: {
		nom: "Conte",
		pluriel: "Contes",
		court: "Conte",
		couleur: "#8a6d3b",
		article: "quel conte"
	}
};
const ORDRE_TYPES = [
	"s",
	"f",
	"p",
	"e",
	"l",
	"o",
	"g",
	"n",
	"d",
	"c"
];
function nomClasse(carte) {
	return carte.ce ?? (carte.c ? CLASSES$1[carte.c].nom : "");
}
/** Comment désigner une carte dans une phrase : « SCP-173 », « MTF Epsilon-11 », « Dr. Alto Clef »… */
function designation(carte) {
	if (carte.num) return carte.num;
	return carte.k === "p" ? carte.nm : `« ${carte.nm} »`;
}
var Base = class Base {
	cartes;
	parId = /* @__PURE__ */ new Map();
	parRarete = RARETES$1.map(() => []);
	/** Cartes par type puis par rareté */
	parType = /* @__PURE__ */ new Map();
	prefixeImage;
	genere;
	catalogue;
	constructor(catalogue, traductions) {
		this.catalogue = catalogue;
		this.cartes = traductions ? catalogue.cartes.map((c) => traductions[c.id] ? {
			...c,
			...traductions[c.id],
			vf: true
		} : c) : catalogue.cartes;
		this.prefixeImage = catalogue.prefixeImage;
		this.genere = catalogue.genere;
		for (const k of ORDRE_TYPES) this.parType.set(k, RARETES$1.map(() => []));
		for (const c of this.cartes) {
			this.parId.set(c.id, c);
			this.parRarete[c.ra].push(c);
			this.parType.get(c.k)[c.ra].push(c);
		}
	}
	image(carte) {
		if (!carte.img) return null;
		return carte.img.startsWith("http") ? carte.img : this.prefixeImage + carte.img;
	}
	/**
	* L'image réduite à la taille d'une carte par wsrv.nl : environ dix fois plus légère que l'originale
	* du wiki, et mise en cache pour tous les joueurs. Carte.tsx revient à l'originale si elle échoue.
	*/
	vignette(carte) {
		const source = this.image(carte);
		if (!source || /\.svg(\?|$)/i.test(source)) return source;
		return `https://wsrv.nl/?url=${encodeURIComponent(source)}&w=600&we&output=webp&q=78${/\.gif(\?|$)/i.test(source) ? "&n=-1" : ""}`;
	}
	/** Une carte au hasard d'une rareté donnée, parmi certains types. */
	auHasard(rarete, types) {
		if (!types) {
			const liste = this.parRarete[rarete];
			return liste[Math.floor(Math.random() * liste.length)];
		}
		const pools = types.map((k) => this.parType.get(k)[rarete]).filter((l) => l.length);
		const total = pools.reduce((s, l) => s + l.length, 0);
		let x = Math.floor(Math.random() * total);
		for (const l of pools) {
			if (x < l.length) return l[x];
			x -= l.length;
		}
		return this.auHasard(rarete);
	}
	avecTraductions(traductions) {
		return new Base(this.catalogue, traductions ?? void 0);
	}
};
// src/engine/quiz.ts
const EXPURGE = "████";
const CLASSES_STANDARD = [
	"Safe",
	"Euclid",
	"Keter",
	"Thaumiel",
	"Apollyon",
	"Neutralized"
];
const SURNOM_INCONNU = /^\[DONNÉES EXPURGÉES\]$|^\[ACCESS DENIED\]$|^\[unknown\]$/i;
const RARETES_TEXTE = [
	"Commune",
	"Peu commune",
	"Rare",
	"Épique",
	"Légendaire",
	"Mythique"
];
const TAGS_GENERIQUES = /* @__PURE__ */ new Set([
	"tale",
	"goi-format",
	"hub"
]);
function melanger(liste) {
	const copie = [...liste];
	for (let i = copie.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copie[i], copie[j]] = [copie[j], copie[i]];
	}
	return copie;
}
function choisir$1(liste) {
	return liste[Math.floor(Math.random() * liste.length)];
}
const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const majuscule = (texte) => texte[0].toUpperCase() + texte.slice(1);
/** Caviarde la désignation (et les sous-numéros SCP-173-1…) et le nom de la fiche dans un extrait. */
function caviarder(texte, carte) {
	let resultat = texte;
	if (carte.num) {
		const numero = echapper(carte.num).replace(/\\-|-/g, "[-‑ ]?");
		const prefixe = carte.num.split(/[- ]/)[0];
		resultat = resultat.replace(new RegExp(`${numero}(?!\\d)(-[A-Z0-9]+)*`, "gi"), `${prefixe}-${EXPURGE}`);
	}
	if (!SURNOM_INCONNU.test(carte.nm) && carte.nm.length > 3) {
		const nom = carte.nm.replace(/^(The |Dr\.? |Agent |Director )/i, "").replace(/\s*\(.*\)$/, "");
		if (nom.length > 3) resultat = resultat.replace(new RegExp(echapper(nom), "gi"), "█████");
	}
	return resultat;
}
function construire(sujet, intitule, bonne, leurres, difficulte, document, image) {
	const uniques = [...new Set(leurres.filter((l) => l && l !== bonne))].slice(0, 3);
	if (uniques.length < 3) return null;
	const options = melanger([bonne, ...uniques]);
	return {
		sujet,
		intitule,
		document,
		image,
		options,
		bonne: options.indexOf(bonne),
		difficulte
	};
}
/** Une image qui montre vraiment l'anomalie : pas un logo, un en-tête ou un schéma vectoriel */
const IMAGE_PARLANTE = /\.(jpe?g|png|webp|gif)(\?|$)/i;
const IMAGE_DECOR = /header|logo|banner|bandeau|icon|signature|seal|sceau|title|titre/i;
/** Fiches du même type et de rareté proche : des leurres plausibles. */
function voisines(base, carte, nombre, exclure = [], filtre) {
	const parRarete = base.parType.get(carte.k);
	const choisies = [];
	const ids = /* @__PURE__ */ new Set([carte.id, ...exclure.map((c) => c.id)]);
	for (let essai = 0; choisies.length < nombre && essai < 300; essai++) {
		const rarete = Math.min(5, carte.ra + (Math.random() < .5 ? 0 : 1));
		const c = choisir$1(parRarete[rarete].length > 4 ? parRarete[rarete] : parRarete.flat());
		if (!ids.has(c.id) && !SURNOM_INCONNU.test(c.nm) && (!filtre || filtre(c))) {
			ids.add(c.id);
			choisies.push(c);
		}
	}
	return choisies;
}
const etiquette = (c) => SURNOM_INCONNU.test(c.nm) ? c.num ?? c.nm : c.num && c.num !== c.nm ? `${c.num} — ${c.nm}` : c.nm;
const aSurnom = (c) => !!c.num && c.num !== c.nm && !SURNOM_INCONNU.test(c.nm);
/** En VF, une réponse traduite parmi des leurres anglais se repère trop facilement : même langue partout. */
const memeLangue = (s) => (c) => !!c.vf === !!s.vf;
/**
* `identification` : la bonne réponse désigne la carte elle-même (numéro, document caviardé).
* Ces questions portent sur la carte adverse, cachée pendant la question, ou sur une fiche sans désignation.
*/
const GENERATEURS = [
	{
		poids: 4,
		identification: true,
		illustree: true,
		f: (b, s) => {
			const image = s.k === "s" && s.num && s.img && IMAGE_PARLANTE.test(s.img) && !IMAGE_DECOR.test(s.img) ? b.vignette(s) : null;
			if (!image) return null;
			const leurres = voisines(b, s, 6, [], aSurnom).map(etiquette);
			return construire(s, "Quelle anomalie est représentée sur ce cliché ?", etiquette(s), leurres, 1, void 0, image);
		}
	},
	{
		poids: 3,
		f: (_b, s) => {
			if (s.k !== "s") return null;
			const bonne = nomClasse(s);
			return construire(s, `Quelle est la classe de confinement de ${s.num} ?`, bonne, melanger(CLASSES_STANDARD.filter((c) => c !== bonne)), 0);
		}
	},
	{
		poids: 3,
		f: (b, s) => {
			if (!aSurnom(s)) return null;
			const leurres = voisines(b, s, 3, [], (c) => aSurnom(c) && memeLangue(s)(c)).map((c) => c.nm);
			return construire(s, `Quel est le surnom de ${s.num} ?`, s.nm, leurres, 1);
		}
	},
	{
		poids: 2,
		identification: true,
		f: (b, s) => {
			if (!aSurnom(s)) return null;
			const leurres = voisines(b, s, 3, [], (c) => aSurnom(c) && memeLangue(s)(c)).map((c) => c.num ?? "");
			return construire(s, `${majuscule(TYPES[s.k].article)} porte le surnom « ${s.nm} » ?`, s.num, leurres, 1);
		}
	},
	{
		poids: 4,
		identification: true,
		f: (b, s, autre) => {
			if (!s.x || s.x.length < 60) return null;
			const leurres = voisines(b, s, 3, [autre], memeLangue(s)).map(etiquette);
			return construire(s, s.k === "p" ? "Qui ce dossier décrit-il ?" : s.k === "c" || s.k === "d" ? `De ${TYPES[s.k].article} cet extrait est-il tiré ?` : `${majuscule(TYPES[s.k].article)} ce document décrit-il ?`, etiquette(s), leurres, 1, caviarder(s.x, s));
		}
	},
	{
		poids: 2,
		identification: true,
		f: (b, s, autre) => {
			if (!s.q || s.q.length < 60) return null;
			const leurres = voisines(b, s, 3, [autre], memeLangue(s)).map(etiquette);
			return construire(s, "Ces procédures de confinement concernent…", etiquette(s), leurres, 2, caviarder(s.q, s));
		}
	},
	{
		poids: 2,
		f: (b, s) => {
			const valide = (t) => !/^\d+$/.test(t) && t.length > 3 && !TAGS_GENERIQUES.has(t);
			const tags = (s.t ?? []).filter(valide);
			if (!tags.length) return null;
			const propres = new Set(s.t);
			const leurres = [];
			for (let essai = 0; leurres.length < 3 && essai < 100; essai++) {
				const t = choisir$1(choisir$1(b.parType.get(s.k).flat()).t ?? []);
				if (t && valide(t) && !propres.has(t) && !leurres.includes(t)) leurres.push(t);
			}
			return construire(s, `Lequel de ces tags du wiki est associé à ${designation(s)} ?`, choisir$1(tags), leurres, 1);
		}
	},
	{
		poids: 2,
		f: (b, s) => {
			if (!s.cat || ![
				"p",
				"c",
				"d"
			].includes(s.k)) return null;
			const categories = [...new Set(b.parType.get(s.k).flat().map((c) => c.cat).filter((c) => !!c && c !== s.cat))];
			return construire(s, s.k === "p" ? `Quelle est la fonction de ${s.nm} ?` : s.k === "c" ? `Quel est le genre du conte ${designation(s)} ?` : `Quel Groupe d'intérêt est à l'origine de ${designation(s)} ?`, s.cat, melanger(categories), 1);
		}
	},
	{
		poids: 3,
		f: (b, s) => {
			if (!s.lie?.length) return null;
			const lie = s.lie;
			const leurres = voisines(b, b.auHasard(Math.min(s.ra, 4), ["s"]), 6, [], (c) => !lie.includes(c.num ?? "")).map((c) => c.num ?? "");
			return construire(s, s.k === "f" ? `Au confinement de quelle anomalie l'équipe ${s.num} a-t-elle participé ?` : s.k === "e" ? `Quel dossier implique ${designation(s)} ?` : s.k === "l" ? `Quelle anomalie est confinée au ${s.num} ?` : `À quelle anomalie ${designation(s)} est-il lié ?`, choisir$1(lie), leurres, 2);
		}
	},
	{
		poids: 1,
		f: (_b, s) => {
			if (!s.y) return null;
			const y = s.y;
			const annees = melanger([
				-3,
				-2,
				-1,
				1,
				2,
				3
			].map((d) => y + d).filter((a) => a >= 2008 && a <= (/* @__PURE__ */ new Date()).getFullYear()));
			return construire(s, `En quelle année ${designation(s)} a-t-il été publié sur le wiki ?`, String(y), annees.map(String), 2);
		}
	},
	{
		poids: 1,
		f: (b, s) => {
			if (!s.a) return null;
			const leurres = voisines(b, s, 6).map((c) => c.a ?? "").filter((a) => a && a !== s.a);
			return construire(s, `Qui a écrit ${designation(s)} ?`, s.a, leurres, 2);
		}
	}
];
/**
* Une question sur l'une des deux cartes en jeu ; `cachee` indique que le joueur ne voit pas le sujet ;
* `illustrees` permet les questions à image (combats contre l'IA seulement).
*/
function genererQuestion(base, sujet, autre, cachee, illustrees = false) {
	const permis = GENERATEURS.filter((g) => (cachee || !g.identification || !sujet.num) && (illustrees || !g.illustree));
	const total = permis.reduce((s, g) => s + g.poids, 0);
	for (let essai = 0; essai < 30; essai++) {
		let x = Math.random() * total;
		const q = (permis.find((g) => (x -= g.poids) < 0) ?? permis[0]).f(base, sujet, autre);
		if (q) return q;
	}
	for (const g of permis) {
		const q = g.f(base, sujet, autre);
		if (q) return q;
	}
	return construire(sujet, `Quelle est la rareté de ${designation(sujet)} ?`, RARETES_TEXTE[sujet.ra], RARETES_TEXTE, 0);
}
/** Début d'un extrait de procédures, coupé proprement, sa désignation caviardée */
function extraitProcedures(c, longueur = 150) {
	const t = caviarder(c.q ?? "", c).replace(/\s+/g, " ").trim();
	if (t.length <= longueur) return t;
	const coupe = t.slice(0, longueur);
	return `${coupe.slice(0, Math.max(coupe.lastIndexOf(" "), longueur - 20))}…`;
}
/**
* La question pour reconfiner une anomalie qui s'échappe (Reconfinement) : la carte est visible, donc pas de
* question qui la nomme. Une fois sur deux, quand elle a des procédures, reconnaître les siennes parmi d'autres.
*/
function questionReconfinement(base, anomalie) {
	if (anomalie.q && anomalie.q.length >= 80 && Math.random() < .5) {
		const leurres = voisines(base, anomalie, 6, [], (c) => !!c.q && c.q.length >= 80 && memeLangue(anomalie)(c)).map((c) => extraitProcedures(c));
		const q = construire(anomalie, `Quelles procédures reconfinent ${designation(anomalie)} ?`, extraitProcedures(anomalie), leurres, 2);
		if (q) return q;
	}
	return genererQuestion(base, anomalie, anomalie, false);
}
/** Les Groupes d'intérêt, par leur tag du wiki */
const GROUPES = {
	"serpents-hand": "la Main du Serpent",
	"chaos-insurgency": "l’Insurrection du Chaos",
	"global-occult-coalition": "la Coalition occulte mondiale",
	"marshall-carter-and-dark": "Marshall, Carter & Dark",
	"are-we-cool-yet": "Are We Cool Yet?",
	"broken-god": "l’Église du Dieu Brisé",
	prometheus: "Prometheus Labs",
	"wilsons-wildlife": "Wilson’s Wildlife Solutions",
	"unusual-incidents-unit": "l’Unité des incidents inhabituels",
	"herman-fuller": "le Cirque d’Herman Fuller",
	"black-queen": "la Reine Noire",
	sarkic: "les Sarkiques",
	"gru-division-p": "le GRU Division P",
	"horizon-initiative": "l’Initiative de l’Horizon",
	oneiroi: "les Oneiroi",
	fifthist: "l’Église du Cinquième",
	anderson: "Anderson Robotics",
	"dr-wondertainment": "le Dr Wondertainment",
	factory: "l’Usine",
	"manna-charitable-foundation": "la Fondation caritative Manna",
	ijamea: "l’IJAMEA",
	obskura: "l’Obskuraprojekt",
	alexylva: "l’Université d’Alexylva",
	nobody: "Personne",
	"shark-punching-center": "le Centre de boxe anti-requins",
	daevite: "les Daevites",
	"three-moons-initiative": "l’Initiative des Trois Lunes",
	parawatch: "Parawatch",
	"deer-college": "le Deer College"
};
const SERIES = [
	"",
	"I",
	"II",
	"III",
	"IV",
	"V",
	"VI",
	"VII",
	"VIII",
	"IX",
	"X"
];
const CLASSES = {
	safe: "Safe",
	euclid: "Euclid",
	keter: "Keter",
	thaumiel: "Thaumiel",
	apollyon: "Apollyon"
};
/** Le plus grand groupe de cartes qui partagent une même clé */
function meilleur(cartes, cles) {
	const groupes = /* @__PURE__ */ new Map();
	for (const c of cartes) for (const k of new Set(cles(c))) groupes.set(k, [...groupes.get(k) ?? [], c]);
	let mieux = null;
	for (const [cle, l] of groupes) if (!mieux || l.length > mieux.cartes.length) mieux = {
		cle,
		cartes: l
	};
	return mieux;
}
/** Les synergies thématiques : au moins `seuil` fiches qui portent l'un de ces tags du wiki */
const THEMES = [
	{
		id: "informationnel",
		nom: "Danger informationnel",
		tags: [
			"memetic",
			"cognitohazard",
			"antimemetic",
			"infohazard"
		],
		seuil: 3,
		detail: "mémétiques, cognitodangers ou antimémétiques"
	},
	{
		id: "espace-temps",
		nom: "Espace-temps",
		tags: [
			"temporal",
			"spatial",
			"teleportation",
			"extradimensional"
		],
		seuil: 3,
		detail: "temporelles, spatiales ou extradimensionnelles"
	},
	{
		id: "fin-du-monde",
		nom: "Fin du monde",
		tags: ["k-class-scenario", "reality-bending"],
		seuil: 2,
		detail: "scénario de classe K ou altération de la réalité"
	},
	{
		id: "bestiaire",
		nom: "Bestiaire",
		tags: [
			"animal",
			"biological",
			"species"
		],
		seuil: 3,
		detail: "animales ou biologiques"
	}
];
/** Les fiches de référence liées à un SCP de l'équipe (champ « lie » du catalogue), par type */
const LIENS = {
	f: {
		id: "fim",
		nom: "Unité dédiée",
		verbe: "a confiné"
	},
	l: {
		id: "site",
		nom: "Site d’affectation",
		verbe: "confine"
	},
	e: {
		id: "departement",
		nom: "Département de tutelle",
		verbe: "suit"
	},
	p: {
		id: "personnel",
		nom: "Chercheur référent",
		verbe: "connaît"
	},
	g: {
		id: "gdi",
		nom: "Groupe impliqué",
		verbe: "est mêlé à"
	},
	n: {
		id: "canon",
		nom: "Même canon",
		verbe: "raconte"
	}
};
/** Les synergies de l'équipe : les ordinaires d'abord (les deux premières comptent), puis les exceptions (la première compte). */
function synergies(equipe) {
	const res = [];
	const ajouter = (id, nom, detail, cartes, effet = "temps") => res.push({
		id,
		nom,
		detail,
		cartes: cartes.map((c) => c.id),
		effet
	});
	const scp = equipe.filter((c) => c.k === "s");
	const numeros = new Map(scp.filter((c) => c.num).map((c) => [c.num, c]));
	for (const ref of equipe) {
		const l = LIENS[ref.k];
		if (!l || res.some((x) => x.id === l.id)) continue;
		const lie = (ref.lie ?? []).map((n) => numeros.get(n)).filter((c) => !!c);
		if (lie.length) ajouter(l.id, l.nom, `${ref.num ?? ref.nm} ${l.verbe} ${lie.map((c) => c.num).join(", ")}`, [ref, ...lie]);
	}
	const groupe = meilleur(equipe, (c) => (c.t ?? []).filter((t) => t in GROUPES));
	if (groupe && groupe.cartes.length >= 2) ajouter("groupe", "Groupe d’intérêt", `${groupe.cartes.length} fiches liées à ${GROUPES[groupe.cle]}`, groupe.cartes);
	const gdi = equipe.filter((c) => c.k === "g");
	if (gdi.length >= 2) ajouter("negociations", "Table des négociations", `${gdi.length} fiches de Groupes d’intérêt`, gdi);
	for (const t of THEMES) {
		const l = equipe.filter((c) => (c.t ?? []).some((x) => t.tags.includes(x)));
		if (l.length >= t.seuil) ajouter(t.id, t.nom, `${l.length} fiches ${t.detail}`, l);
	}
	const serie = meilleur(scp, (c) => c.s ? [String(c.s)] : []);
	if (serie && serie.cartes.length >= 3) ajouter("serie", "Même série", `${serie.cartes.length} SCP de la série ${SERIES[Number(serie.cle)] ?? serie.cle}`, serie.cartes);
	const voisins = scp.filter((c) => c.n !== void 0 && c.n > 1 && scp.some((d) => d !== c && Math.abs((d.n ?? -9) - c.n) === 1));
	if (voisins.length >= 2) ajouter("voisins", "Voisins de cellule", `${voisins.map((c) => c.num).join(" et ")} : numéros qui se suivent`, voisins);
	const auteur = meilleur(equipe, (c) => c.a ? [c.a] : []);
	if (auteur && auteur.cartes.length >= 2) ajouter("auteur", "Même plume", `${auteur.cartes.length} fiches de ${auteur.cle}`, auteur.cartes);
	const annee = meilleur(equipe, (c) => c.y ? [String(c.y)] : []);
	if (annee && annee.cartes.length >= 3) ajouter("promotion", `Promotion ${annee.cle}`, `${annee.cartes.length} fiches publiées en ${annee.cle}`, annee.cartes);
	const classe = meilleur(scp, (c) => c.c && CLASSES[c.c] ? [c.c] : []);
	if (classe && classe.cartes.length >= 3) ajouter("classe", `Protocole ${CLASSES[classe.cle]}`, `${classe.cartes.length} SCP de classe ${CLASSES[classe.cle]}`, classe.cartes);
	const un = scp.find((c) => c.num === "SCP-001");
	if (un) ajouter("cle-de-voute", "Clé de voûte", `${un.nm}, une proposition pour SCP-001`, [un], "hesitation");
	const thaumiel = scp.find((c) => c.c === "thaumiel");
	const keter = scp.filter((c) => c.c === "keter");
	if (thaumiel && keter.length) ajouter("contre-feu", "Contre-feu", `${thaumiel.num} (Thaumiel) face à ${keter.map((c) => c.num).join(", ")} (Keter)`, [thaumiel, ...keter], "retrait");
	const types = new Set(equipe.map((c) => c.k));
	if (types.size >= 4) ajouter("intervention", "Équipe d’intervention", `${types.size} types de fiches différents`, equipe, "integrite");
	return res;
}
/** Les synergies qui comptent vraiment (deux ordinaires, une exception) */
function synergiesActives(equipe) {
	const l = synergies(equipe);
	return [...l.filter((s) => s.effet === "temps").slice(0, 2), ...l.filter((s) => s.effet !== "temps").slice(0, 1)];
}
/** Ce que l'équipe apporte en combat contre l'IA */
function effetsEquipe(equipe) {
	const actives = synergiesActives(equipe);
	const exception = actives.find((s) => s.effet !== "temps")?.effet;
	return {
		temps: actives.filter((s) => s.effet === "temps").length * 2,
		integrite: exception === "integrite" ? 10 : 0,
		retrait: exception === "retrait",
		hesitation: exception === "hesitation" ? 1 : 0
	};
}
// serveur/commun.ts
/**
* Outils communs aux duels arbitrés par le serveur (contre l'IA et entre joueurs) : catalogue des cartes,
* identité du joueur, appels aux fonctions SQL avec la clé de service.
*/
var Erreur = class extends Error {
	statut;
	constructor(statut, message) {
		super(message);
		this.statut = statut;
	}
};
let catalogue = null;
let traductions = null;
const bases = /* @__PURE__ */ new Map();
async function telecharger(url) {
	const r = await fetch(url);
	if (!r.ok) throw new Erreur(503, "Catalogue des cartes indisponible, réessayez dans un instant");
	return await r.json();
}
async function base(env, langue) {
	const connue = bases.get(langue);
	if (connue) return connue;
	catalogue ??= telecharger(`${env.site}/data/cards.json`).catch((e) => {
		catalogue = null;
		throw e;
	});
	let b = new Base(await catalogue);
	if (langue === "vf") {
		traductions ??= telecharger(`${env.site}/data/cards.fr.json`).catch((e) => {
			traductions = null;
			throw e;
		});
		b = b.avecTraductions(await traductions);
	}
	bases.set(langue, b);
	return b;
}
function entetesService(env) {
	return env.cleService.startsWith("eyJ") ? {
		apikey: env.cleService,
		Authorization: `Bearer ${env.cleService}`
	} : { apikey: env.cleService };
}
async function joueur(env, req) {
	const jeton = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
	if (!jeton) throw new Erreur(401, "Connexion requise");
	const r = await fetch(`${env.url}/auth/v1/user`, { headers: {
		apikey: env.cleService,
		Authorization: `Bearer ${jeton}`
	} });
	if (!r.ok) throw new Erreur(401, "Session expirée : reconnectez-vous.");
	const u = await r.json();
	if (!u.id) throw new Erreur(401, "Connexion requise");
	return u.id;
}
async function rpc(env, fonction, params) {
	const r = await fetch(`${env.url}/rest/v1/rpc/${fonction}`, {
		method: "POST",
		headers: {
			...entetesService(env),
			"Content-Type": "application/json"
		},
		body: JSON.stringify(params)
	});
	const corps = await r.text();
	if (!r.ok) {
		const message = (() => {
			try {
				return JSON.parse(corps).message;
			} catch {
				return;
			}
		})();
		throw new Erreur(r.status >= 500 ? 500 : 409, message ?? "Erreur du serveur");
	}
	return corps ? JSON.parse(corps) : null;
}
const texte = (v) => typeof v === "string" ? v : "";
function role(c) {
	if (c.id?.startsWith("entite:")) return "attaque";
	switch (c.k) {
		case "f":
		case "p":
		case "e": return "defense";
		case "l": return "fortification";
		case "o": return "protocole";
		default: return "attaque";
	}
}
/** Force d'une brèche selon la classe : un Keter frappe plus fort qu'un Safe */
const FORCE_CLASSE = {
	safe: .9,
	keter: 1.2,
	apollyon: 1.4,
	thaumiel: 1.05
};
const forceClasse = (c) => c.c ? FORCE_CLASSE[c.c] ?? 1 : 1;
/** Une Mythique est l'ultime de sa main : une fois par partie, elle agit une fois et demie et ignore les gardes */
const estUltime = (c) => c.ra === 5;
/** Une FIM a confiné ce SCP dans le wiki (ses liens sont des désignations : « SCP-173 ») */
const aConfine$1 = (fim, scp) => fim.k === "f" && !!scp.num && !!fim.lie?.includes(scp.num);
const campNeuf = () => ({
	cellules: Array(3).fill(80),
	ultime: false
});
const integrite = (c) => c.cellules.reduce((s, x) => s + x, 0);
const tombe = (c) => c.cellules.every((x) => x <= 0);
/** La cellule debout la plus abîmée (ou -1) */
function plusFaible(c) {
	let i = -1;
	c.cellules.forEach((x, j) => {
		if (x > 0 && (i < 0 || x < c.cellules[i])) i = j;
	});
	return i;
}
/** Puissance d'une carte une fois la question passée */
const justesse = (coup) => coup.juste ? 1 : .5;
const nom$1 = (c) => c.num ?? c.nm;
/**
* Résout un tour : les deux coups agissent en même temps. Ordre : protocoles, gardes, brèches (et ripostes),
* réparations, nouvelles cellules. Ne modifie pas les camps reçus.
*/
function resoudre$3(joueur, ia, coupJoueur, coupIA) {
	const camps = {
		joueur: {
			...joueur,
			cellules: [...joueur.cellules]
		},
		ia: {
			...ia,
			cellules: [...ia.cellules]
		}
	};
	const coups = {
		joueur: coupJoueur,
		ia: coupIA
	};
	const evenements = [];
	const autre = (x) => x === "joueur" ? "ia" : "joueur";
	const ordre = ["joueur", "ia"];
	const ultime = {
		joueur: false,
		ia: false
	};
	for (const x of ordre) if (estUltime(coups[x].carte) && !camps[x].ultime) {
		ultime[x] = true;
		camps[x].ultime = true;
		evenements.push({
			camp: x,
			type: "ultime",
			texte: `${nom$1(coups[x].carte)} : ultime déclenché`
		});
	}
	const facteur = {
		joueur: justesse(coupJoueur) * (ultime.joueur ? 1.5 : 1),
		ia: justesse(coupIA) * (ultime.ia ? 1.5 : 1)
	};
	for (const x of ordre) {
		if (role(coups[x].carte) !== "protocole") continue;
		const affaiblissement = coups[x].juste ? .5 : .75;
		facteur[autre(x)] *= affaiblissement;
		evenements.push({
			camp: x,
			type: "protocole",
			texte: `${nom$1(coups[x].carte)} affaiblit ${nom$1(coups[autre(x)].carte)} (×${affaiblissement})`
		});
	}
	const garde = {
		joueur: /* @__PURE__ */ new Map(),
		ia: /* @__PURE__ */ new Map()
	};
	for (const x of ordre) {
		const c = coups[x];
		if (role(c.carte) !== "defense") continue;
		const valeur = Math.round(c.carte.def * facteur[x]);
		const cellules = ultime[x] ? camps[x].cellules.map((_, i) => i) : [cible(camps[x], c.cible)];
		for (const i of cellules) if (i >= 0) garde[x].set(i, valeur);
		if (cellules[0] >= 0) evenements.push({
			camp: x,
			type: "garde",
			cellule: ultime[x] ? void 0 : cellules[0],
			valeur,
			texte: `${nom$1(c.carte)} garde ${ultime[x] ? "toutes les cellules" : `la cellule ${cellules[0] + 1}`} (${valeur})`
		});
	}
	const degats = [];
	for (const x of ordre) {
		const c = coups[x];
		if (role(c.carte) !== "attaque") continue;
		const y = autre(x);
		const i = cible(camps[y], c.cible);
		if (i < 0) continue;
		const brut = Math.round(c.carte.atk * forceClasse(c.carte) * facteur[x]);
		const defenseur = coups[y];
		if (role(defenseur.carte) === "defense" && garde[y].has(i) && aConfine$1(defenseur.carte, c.carte)) {
			evenements.push({
				camp: y,
				type: "reconfinement",
				cellule: i,
				texte: `${nom$1(defenseur.carte)} reconnaît ${nom$1(c.carte)} et le reconfine`
			});
			continue;
		}
		const bouclier = ultime[x] ? 0 : garde[y].get(i) ?? 0;
		const valeur = Math.max(0, brut - bouclier);
		degats.push({
			camp: y,
			cellule: i,
			valeur
		});
		evenements.push({
			camp: x,
			type: "breche",
			cellule: i,
			valeur,
			texte: bouclier ? `${nom$1(c.carte)} frappe la cellule ${i + 1} : ${brut} − ${bouclier} gardés = ${valeur}` : `${nom$1(c.carte)} frappe la cellule ${i + 1} : ${valeur}`
		});
		if (role(defenseur.carte) === "defense" && defenseur.carte.k === "f" && bouclier > brut) {
			const j = cible(camps[x], i);
			const riposte = Math.round((bouclier - brut) * .5);
			if (j >= 0 && riposte > 0) {
				degats.push({
					camp: x,
					cellule: j,
					valeur: riposte
				});
				evenements.push({
					camp: y,
					type: "riposte",
					cellule: j,
					valeur: riposte,
					texte: `${nom$1(defenseur.carte)} riposte sur la cellule ${j + 1} : ${riposte}`
				});
			}
		}
	}
	for (const d of degats) camps[d.camp].cellules[d.cellule] = Math.max(0, camps[d.camp].cellules[d.cellule] - d.valeur);
	for (const x of ordre) {
		const c = coups[x];
		const soin = role(c.carte) === "defense" && c.carte.k !== "f" ? {
			i: cible(camps[x], c.cible),
			v: Math.round(c.carte.def * .25 * facteur[x])
		} : role(c.carte) === "attaque" && c.carte.c === "thaumiel" ? {
			i: plusFaible(camps[x]),
			v: Math.round(15 * facteur[x])
		} : null;
		if (!soin || soin.i < 0 || camps[x].cellules[soin.i] <= 0) continue;
		const avant = camps[x].cellules[soin.i];
		camps[x].cellules[soin.i] = Math.min(80, avant + soin.v);
		const v = camps[x].cellules[soin.i] - avant;
		if (v > 0) evenements.push({
			camp: x,
			type: "reparation",
			cellule: soin.i,
			valeur: v,
			texte: `${nom$1(c.carte)} répare la cellule ${soin.i + 1} : +${v}`
		});
	}
	for (const x of ordre) {
		const c = coups[x];
		if (role(c.carte) !== "fortification" || tombe(camps[x])) continue;
		const v = Math.round(c.carte.def * .6 * facteur[x]);
		if (camps[x].cellules.length < 4) {
			camps[x].cellules.push(Math.min(80, v));
			const i = camps[x].cellules.length - 1;
			evenements.push({
				camp: x,
				type: "cellule",
				cellule: i,
				valeur: camps[x].cellules[i],
				texte: `${nom$1(c.carte)} ouvre la cellule ${i + 1} (${camps[x].cellules[i]})`
			});
		} else {
			const i = plusFaible(camps[x]);
			const avant = camps[x].cellules[i];
			camps[x].cellules[i] = Math.min(80, avant + v);
			evenements.push({
				camp: x,
				type: "reparation",
				cellule: i,
				valeur: camps[x].cellules[i] - avant,
				texte: `${nom$1(c.carte)} répare la cellule ${i + 1} : +${camps[x].cellules[i] - avant}`
			});
		}
	}
	return {
		...camps,
		evenements
	};
}
/** La cellule visée si elle tient encore, sinon la plus abîmée de celles qui tiennent */
function cible(camp, i) {
	return Number.isInteger(i) && camp.cellules[i] > 0 ? i : plusFaible(camp);
}
/** Initiative du tour suivant : bonne réponse en moins de 7 s, et la plus rapide si les deux le sont */
function initiative(joueur, ia) {
	const j = joueur.juste && joueur.temps <= 7;
	const a = ia.juste && ia.temps <= 7;
	if (j && a) return joueur.temps <= ia.temps ? "joueur" : "ia";
	return j ? "joueur" : a ? "ia" : null;
}
function issue(joueur, ia) {
	if (tombe(ia) && !tombe(joueur)) return "victoire";
	if (tombe(joueur) && !tombe(ia)) return "defaite";
	const d = integrite(joueur) - integrite(ia);
	return d > 0 ? "victoire" : d < 0 ? "defaite" : "nul";
}
const terminee$1 = (tour, joueur, ia) => tour >= 5 || tombe(joueur) || tombe(ia);
/**
* Le choix de l'IA : sa carte et sa cible. `vu` est le coup du joueur quand l'IA a l'initiative (elle choisit en
* le voyant) ; `finesse` (0 à 1) la fait jouer plus ou moins au mieux.
*/
function choisirIA(main, campIA, campJoueur, vu, finesse, hasard = Math.random) {
	const options = main.map((carte) => {
		const r = role(carte);
		let cibleChoisie = 0;
		let valeur = 0;
		if (r === "attaque") {
			cibleChoisie = plusFaible(campJoueur);
			valeur = carte.atk * forceClasse(carte);
			if (campJoueur.cellules[cibleChoisie] <= valeur) valeur += 25;
			if (vu && role(vu.carte) === "defense") {
				const libres = campJoueur.cellules.map((x, i) => x > 0 && i !== vu.cible ? i : -1).filter((i) => i >= 0);
				if (libres.length) cibleChoisie = libres.reduce((a, b) => campJoueur.cellules[b] < campJoueur.cellules[a] ? b : a);
			}
		} else if (r === "defense") {
			cibleChoisie = vu && role(vu.carte) === "attaque" ? cible(campIA, vu.cible) : plusFaible(campIA);
			valeur = carte.def * (vu ? role(vu.carte) === "attaque" ? 1.6 : .3 : .8);
			if (vu && aConfine$1(carte, vu.carte)) valeur += 100;
		} else if (r === "fortification") valeur = campIA.cellules.length < 4 || campIA.cellules.some((x) => x < 40) ? carte.def * .9 : 10;
		else valeur = vu ? role(vu.carte) === "attaque" ? vu.carte.atk * .8 : 15 : 35;
		if (estUltime(carte) && !campIA.ultime) valeur *= 1.5;
		valeur *= 1 - (1 - finesse) * hasard();
		return {
			carte,
			cible: cibleChoisie,
			valeur
		};
	});
	options.sort((a, b) => b.valeur - a.valeur);
	return {
		carte: options[0].carte,
		cible: Math.max(0, options[0].cible)
	};
}
// serveur/breche.ts
/**
* La « Brèche de confinement » contre l'IA, arbitrée par le serveur (fonction Edge « duel », actions breche_*).
* Les règles sont dans src/engine/breche.ts. Le navigateur ne voit jamais la bonne réponse avant d'avoir répondu,
* ni la carte de l'IA avant la résolution du tour, sauf quand il a l'initiative : l'IA s'engage alors la première
* et sa carte lui est montrée. L'état est enregistré dans prive.duels_ia, comme les duels classiques.
*/
const ACTIONS_BRECHE = /* @__PURE__ */ new Set([
	"breche_debuter",
	"breche_jouer",
	"breche_repondre"
]);
async function lire$4(env, id, joueur) {
	const r = await rpc(env, "duel_lire", {
		p_duel: id,
		p_joueur: joueur
	});
	if (!r?.etat || r.etat.mode !== "breche") throw new Erreur(404, "Confrontation introuvable ou déjà terminée");
	return {
		etat: r.etat,
		version: r.version
	};
}
async function ecrire$3(env, id, joueur, version, etat) {
	if (!await rpc(env, "duel_ecrire", {
		p_duel: id,
		p_joueur: joueur,
		p_version: version,
		p_etat: etat
	})) throw new Erreur(409, "La confrontation a changé entre-temps : rechargez la page");
}
const adversaireDe$1 = (niveau) => ADVERSAIRES.find((a) => a.niveau === niveau);
/** Avec l'initiative du joueur, l'IA s'engage d'avance, sans voir son coup */
async function preparerTour(env, etat) {
	if (etat.initiative !== "joueur") return {
		...etat,
		coupIA: void 0
	};
	const b = await base(env, etat.langue);
	const c = choisirIA(etat.mainIA.map((id) => b.parId.get(id)), etat.ia, etat.joueur, null, adversaireDe$1(etat.niveau).precision);
	return {
		...etat,
		coupIA: {
			carte: c.carte.id,
			cible: c.cible
		}
	};
}
/** Ce que le navigateur peut savoir de la partie */
function vuePublique$1(etat) {
	return {
		tour: etat.tour,
		main: etat.main,
		cartesIA: etat.mainIA.length,
		joueur: etat.joueur,
		ia: etat.ia,
		initiative: etat.initiative,
		revele: etat.initiative === "joueur" ? etat.coupIA : void 0,
		bonnes: etat.bonnes
	};
}
async function debuter$3(env, idJoueur, corps) {
	const adversaire = ADVERSAIRES.find((a) => a.niveau === corps.niveau);
	if (!adversaire) throw new Erreur(400, "Adversaire inconnu");
	const prep = await rpc(env, "duel_preparer", {
		p_joueur: idJoueur,
		p_niveau: adversaire.niveau
	});
	const b = await base(env, prep.langue);
	if (prep.equipe.some((id) => !b.parId.has(id))) throw new Erreur(409, "Nouvelles fiches disponibles : rechargez la page");
	const etat = {
		mode: "breche",
		niveau: adversaire.niveau,
		langue: prep.langue,
		main: prep.equipe,
		mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
		tour: 1,
		joueur: campNeuf(),
		ia: campNeuf(),
		bonnes: 0,
		phase: "choix",
		initiative: null,
		...(() => {
			const e = effetsEquipe(prep.equipe.map((id) => b.parId.get(id)));
			return {
				bonus: e.temps,
				retrait: e.retrait,
				hesitation: e.hesitation
			};
		})()
	};
	await ecrire$3(env, prep.id, idJoueur, 0, etat);
	return {
		id: prep.id,
		...vuePublique$1(etat)
	};
}
async function jouer$2(env, idJoueur, corps, maintenant) {
	const id = texte(corps.id);
	const { etat, version } = await lire$4(env, id, idJoueur);
	if (etat.phase !== "choix") throw new Erreur(409, "Une question attend déjà votre réponse");
	const idCarte = texte(corps.carte);
	if (!etat.main.includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main");
	const cible = typeof corps.cible === "number" && Number.isInteger(corps.cible) ? corps.cible : 0;
	const b = await base(env, etat.langue);
	const adversaire = adversaireDe$1(etat.niveau);
	const carte = b.parId.get(idCarte);
	const coupIA = etat.coupIA ?? (() => {
		const c = choisirIA(etat.mainIA.map((x) => b.parId.get(x)), etat.ia, etat.joueur, etat.initiative === "ia" ? {
			carte,
			cible
		} : null, adversaire.precision);
		return {
			carte: c.carte.id,
			cible: c.cible
		};
	})();
	const carteIA = b.parId.get(coupIA.carte);
	const q = genererQuestion(b, carte, carteIA, false);
	const qIA = genererQuestion(b, carteIA, carte, false);
	const brute = reponseAdversaire(adversaire, qIA);
	const reponseIA = {
		...brute,
		temps: Math.min(20, brute.temps + (etat.hesitation ?? 0))
	};
	if (etat.retrait && etat.tour === 1 && q.options.length > 3) {
		const candidates = q.options.map((_, i) => i).filter((i) => i !== q.bonne);
		const retiree = candidates[Math.floor(Math.random() * candidates.length)];
		q.options = q.options.filter((_, i) => i !== retiree);
		if (q.bonne > retiree) q.bonne--;
	}
	await ecrire$3(env, id, idJoueur, version, {
		...etat,
		phase: "question",
		coup: {
			carte: idCarte,
			cible
		},
		coupIA,
		question: {
			intitule: q.intitule,
			document: q.document,
			options: q.options,
			bonne: q.bonne
		},
		reponseIA: {
			...reponseIA,
			bonne: qIA.bonne
		},
		debut: maintenant
	});
	return {
		tour: etat.tour,
		question: {
			intitule: q.intitule,
			document: q.document,
			options: q.options
		},
		duree: 20 + (etat.bonus ?? 0),
		tempsIA: reponseIA.temps
	};
}
async function repondre$4(env, idJoueur, corps, maintenant) {
	const id = texte(corps.id);
	const { etat, version } = await lire$4(env, id, idJoueur);
	if (etat.phase !== "question" || !etat.question || !etat.coup || !etat.coupIA || !etat.reponseIA || etat.debut === void 0) throw new Erreur(409, "Aucune question en cours");
	const q = etat.question;
	const ecoule = (maintenant - etat.debut) / 1e3;
	const choix = corps.choix;
	const duree = 20 + (etat.bonus ?? 0);
	const choixRetenu = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= duree + 3 ? choix : null;
	const temps = Math.min(duree, ecoule);
	const juste = choixRetenu === q.bonne;
	const justeIA = etat.reponseIA.choix === etat.reponseIA.bonne;
	const b = await base(env, etat.langue);
	const carte = b.parId.get(etat.coup.carte);
	const carteIA = b.parId.get(etat.coupIA.carte);
	const r = resoudre$3(etat.joueur, etat.ia, {
		carte,
		cible: etat.coup.cible,
		juste
	}, {
		carte: carteIA,
		cible: etat.coupIA.cible,
		juste: justeIA
	});
	const suivant = {
		...etat,
		phase: "choix",
		tour: etat.tour + 1,
		joueur: r.joueur,
		ia: r.ia,
		bonnes: etat.bonnes + (juste ? 1 : 0),
		main: etat.main.filter((x) => x !== etat.coup.carte),
		mainIA: etat.mainIA.filter((x) => x !== etat.coupIA.carte),
		initiative: initiative({
			juste,
			temps
		}, {
			juste: justeIA,
			temps: etat.reponseIA.temps
		}),
		coup: void 0,
		coupIA: void 0,
		question: void 0,
		reponseIA: void 0,
		debut: void 0
	};
	const resultat = {
		bonne: q.bonne,
		choix: choixRetenu,
		temps,
		coupIA: {
			carte: carteIA.id,
			cible: etat.coupIA.cible,
			role: role(carteIA),
			juste: justeIA,
			temps: etat.reponseIA.temps
		},
		evenements: r.evenements
	};
	if (!terminee$1(etat.tour, r.joueur, r.ia)) {
		const pret = await preparerTour(env, suivant);
		await ecrire$3(env, id, idJoueur, version, pret);
		return {
			...resultat,
			...vuePublique$1(pret),
			fin: null
		};
	}
	const issue$1 = issue(r.joueur, r.ia);
	const gains = await rpc(env, "duel_clore", {
		p_duel: id,
		p_joueur: idJoueur,
		p_version: version,
		p_etat: suivant,
		p_issue: issue$1,
		p_bonnes: suivant.bonnes,
		p_questions: etat.tour
	});
	return {
		...resultat,
		...vuePublique$1(suivant),
		fin: {
			issue: issue$1,
			...gains
		}
	};
}
async function traiterBreche(env, idJoueur, action, corps, maintenant) {
	switch (action) {
		case "breche_debuter": return debuter$3(env, idJoueur, corps);
		case "breche_jouer": return jouer$2(env, idJoueur, corps, maintenant);
		default: return repondre$4(env, idJoueur, corps, maintenant);
	}
}
// serveur/epreuve.ts
const ACTIONS_EPREUVE = /* @__PURE__ */ new Set([
	"epreuve_debuter",
	"epreuve_question",
	"epreuve_repondre"
]);
/** Des anomalies célèbres aux dossiers oubliés : la rareté du sujet de chaque question */
const RARETES = [
	4,
	4,
	3,
	3,
	3,
	2,
	2,
	2,
	1,
	1
];
/** Générateur pseudo-aléatoire (mulberry32) amorcé par une chaîne */
function generateur(graine) {
	let h = 1779033703 ^ graine.length;
	for (let i = 0; i < graine.length; i++) {
		h = Math.imul(h ^ graine.charCodeAt(i), 3432918353);
		h = h << 13 | h >>> 19;
	}
	let a = h >>> 0;
	return () => {
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/**
* Les dix questions d'une semaine. Le générateur de questions tire avec Math.random : on le remplace le temps de ce
* calcul synchrone, si bien que deux appels pour la même semaine donnent exactement les mêmes questions.
*/
function questionsDeLaSemaine(b, semaine) {
	const original = Math.random;
	Math.random = generateur(`epreuve:${semaine}`);
	try {
		const dejaVues = /* @__PURE__ */ new Set();
		return RARETES.map((ra) => {
			const candidates = (b.parType.get("s")?.[ra] ?? b.parRarete[ra]).filter((c) => !dejaVues.has(c.id));
			const sujet = candidates[Math.floor(Math.random() * candidates.length)];
			dejaVues.add(sujet.id);
			const autres = b.parRarete[ra];
			let autre = autres[Math.floor(Math.random() * autres.length)];
			if (autre.id === sujet.id) autre = autres[(autres.indexOf(autre) + 1) % autres.length];
			const q = genererQuestion(b, sujet, autre, true);
			return {
				sujet: sujet.id,
				intitule: q.intitule,
				document: q.document,
				options: q.options,
				bonne: q.bonne
			};
		});
	} finally {
		Math.random = original;
	}
}
/**
* Les mêmes questions pour tous, mais les réponses dans un ordre propre à chaque agent : se souffler « la C » ne sert
* à rien.
*/
function melangerPourJoueur(questions, graine) {
	const hasard = generateur(graine);
	return questions.map((q) => {
		const ordre = q.options.map((_, i) => i);
		for (let i = ordre.length - 1; i > 0; i--) {
			const j = Math.floor(hasard() * (i + 1));
			[ordre[i], ordre[j]] = [ordre[j], ordre[i]];
		}
		return {
			...q,
			options: ordre.map((i) => q.options[i]),
			bonne: ordre.indexOf(q.bonne)
		};
	});
}
const pointsDe = (juste, temps) => juste ? 100 + Math.round(50 * Math.max(0, 1 - temps / 20)) : 0;
const score = (e) => e.reponses.reduce((s, r) => s + r.points, 0);
const bonnes = (e) => e.reponses.filter((r) => r.points > 0).length;
const lire$3 = (env, idJoueur) => rpc(env, "epreuve_preparer", { p_joueur: idJoueur });
async function ecrire$2(env, idJoueur, version, etat) {
	if (!await rpc(env, "epreuve_ecrire", {
		p_joueur: idJoueur,
		p_semaine: etat.semaine,
		p_version: version,
		p_etat: etat,
		p_score: score(etat),
		p_bonnes: bonnes(etat),
		p_termine: etat.reponses.length >= 10
	})) throw new Erreur(409, version === 0 ? "Épreuve déjà commencée cette semaine" : "L’épreuve a changé entre-temps : rechargez la page");
}
/** Ce que voit le joueur : jamais les bonnes réponses à venir */
function vue$1(e) {
	return {
		index: e.reponses.length,
		total: 10,
		score: score(e),
		bonnes: bonnes(e),
		termine: e.reponses.length >= 10
	};
}
function questionVue(e, maintenant) {
	const q = e.questions[e.reponses.length];
	return {
		...vue$1(e),
		question: {
			intitule: q.intitule,
			document: q.document,
			options: q.options
		},
		duree: 20,
		ecoule: e.debut === void 0 ? 0 : (maintenant - e.debut) / 1e3
	};
}
async function debuter$2(env, idJoueur) {
	const t = await lire$3(env, idJoueur);
	if (t.termine) throw new Erreur(409, "Vous avez déjà passé l’Épreuve de cette semaine");
	if (t.etat) return vue$1(t.etat);
	const b = await base(env, t.langue);
	const etat = {
		semaine: t.semaine,
		questions: melangerPourJoueur(questionsDeLaSemaine(b, t.semaine), `${t.semaine}:${idJoueur}`),
		reponses: []
	};
	await ecrire$2(env, idJoueur, 0, etat);
	return vue$1(etat);
}
async function question(env, idJoueur, maintenant) {
	const t = await lire$3(env, idJoueur);
	if (!t.etat) throw new Erreur(404, "Commencez d’abord l’Épreuve");
	if (t.termine) throw new Erreur(409, "Épreuve terminée");
	const etat = t.etat;
	if (etat.debut !== void 0 && (maintenant - etat.debut) / 1e3 <= 23) return questionVue(etat, maintenant);
	let manquee = false;
	if (etat.debut !== void 0) {
		etat.reponses.push({
			choix: null,
			temps: 20,
			points: 0
		});
		manquee = true;
	}
	if (etat.reponses.length >= 10) {
		etat.debut = void 0;
		await ecrire$2(env, idJoueur, t.version, etat);
		return {
			...vue$1(etat),
			manquee
		};
	}
	etat.debut = maintenant;
	await ecrire$2(env, idJoueur, t.version, etat);
	return {
		...questionVue(etat, maintenant),
		manquee
	};
}
async function repondre$3(env, idJoueur, corps, maintenant) {
	const t = await lire$3(env, idJoueur);
	const etat = t.etat;
	if (!etat || t.termine || etat.debut === void 0) throw new Erreur(409, "Aucune question en cours");
	const q = etat.questions[etat.reponses.length];
	const ecoule = (maintenant - etat.debut) / 1e3;
	const choix = corps.choix;
	const choixRetenu = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= 23 ? choix : null;
	const temps = Math.min(20, ecoule);
	const points = pointsDe(choixRetenu === q.bonne, temps);
	etat.reponses.push({
		choix: choixRetenu,
		temps,
		points
	});
	etat.debut = void 0;
	await ecrire$2(env, idJoueur, t.version, etat);
	return {
		...vue$1(etat),
		bonne: q.bonne,
		choix: choixRetenu,
		temps,
		points
	};
}
async function traiterEpreuve(env, idJoueur, action, corps, maintenant) {
	switch (action) {
		case "epreuve_debuter": return debuter$2(env, idJoueur);
		case "epreuve_question": return question(env, idJoueur, maintenant);
		default: return repondre$3(env, idJoueur, corps, maintenant);
	}
}
const nature = (c) => c.id.startsWith("entite:") || [
	"s",
	"g",
	"c",
	"n",
	"d"
].includes(c.k) ? "anomalie" : "soutien";
function soutien(c) {
	return c.k === "f" ? "fim" : c.k === "l" ? "site" : c.k === "o" ? "protocole" : "personnel";
}
const campReco = () => ({
	integrite: 150,
	manifestation: 0,
	poison: 0,
	manifeste: false,
	reconfinementsAuto: 0,
	questionsCourtes: 0,
	echecsAuto: 0,
	questionsFaciles: 0
});
/** Une FIM a confiné ce SCP dans le wiki (ses liens sont des désignations : « SCP-173 ») */
const aConfine = (fim, a) => fim.k === "f" && !!a.num && !!fim.lie?.includes(a.num);
const POUVOIRS_PROTOCOLES = {
	"proto:ira-5": {
		texte: "Closing Time : l’anomalie qui arrive est reconfinée d’office.",
		auto: true
	},
	"proto:code-red": {
		texte: "Agresseur de grande taille : la brèche qui arrive est divisée par quatre.",
		attenuation: .25
	},
	"proto:code-green": {
		texte: "Décontamination : toute contagion de votre Site disparaît.",
		purge: true
	},
	"proto:code-amber": {
		texte: "Filtres mémétiques : 8 secondes de plus pour reconfiner.",
		tempsBonus: 8
	},
	"proto:110-montauk": {
		texte: "Le rituel retient l’ennemi : sa jauge de Manifestation perd 50.",
		vidange: 50
	},
	"proto:patmos": {
		texte: "Ordre d’urgence : vos deux prochains reconfinements réussissent d’office.",
		reconfinementsAuto: 2
	},
	"proto:ck": {
		texte: "Restructuration de la réalité : votre Site regagne 25 points.",
		soin: 25
	},
	"proto:xk": {
		texte: "Fin du monde : les deux Sites perdent 20 points.",
		frappeLesDeux: 20
	}
};
function preparerReconfinement(anomalie, defenseur, soutienDefenseur) {
	const effet = effetDe(anomalie);
	const s = soutienDefenseur && nature(soutienDefenseur) === "soutien" ? soutien(soutienDefenseur) : null;
	const pouvoir = s === "protocole" ? POUVOIRS_PROTOCOLES[soutienDefenseur.id] : void 0;
	const neutralise = s === "protocole";
	const dissipe = neutralise || s === "personnel";
	let duree = 20;
	if (effet.alteration === "temporel" && !dissipe) duree = 12;
	if (defenseur.questionsCourtes > 0) duree = 8;
	if (s === "personnel") duree += 8;
	duree += pouvoir?.tempsBonus ?? 0;
	const retirees = Math.min(2, (s === "fim" ? soutienDefenseur.ra >= 3 ? 2 : 1 : 0) + (defenseur.questionsFaciles > 0 ? 2 : 0));
	const auto = defenseur.reconfinementsAuto > 0 || pouvoir?.auto || s === "fim" && aConfine(soutienDefenseur, anomalie) ? "reussite" : defenseur.echecsAuto > 0 ? "echec" : null;
	return {
		effet,
		alteree: !dissipe && !!effet.alteration,
		actif: !neutralise,
		duree,
		retirees,
		auto,
		attenuation: neutralise ? pouvoir?.attenuation ?? .5 : 1
	};
}
/** Après le tour, le pouvoir d'un Protocole joué par `auteur` (camps modifiés en place) */
function appliquerProtocole(protocole, auteur, camps, ev) {
	const p = POUVOIRS_PROTOCOLES[protocole.id];
	if (!p) return;
	const moi = camps[auteur];
	const lui = camps[auteur === "joueur" ? "ia" : "joueur"];
	const nom = protocole.num ?? protocole.nm;
	if (p.soin) {
		moi.integrite = Math.min(150, moi.integrite + p.soin);
		ev.push({
			camp: auteur,
			type: "soin",
			valeur: p.soin,
			texte: `${nom} : +${p.soin}`
		});
	}
	if (p.purge && moi.poison > 0) {
		moi.poison = 0;
		ev.push({
			camp: auteur,
			type: "soin",
			texte: `${nom} : contamination purgée`
		});
	}
	if (p.vidange) {
		lui.manifestation = Math.max(0, lui.manifestation - p.vidange);
		ev.push({
			camp: auteur === "joueur" ? "ia" : "joueur",
			type: "jauge",
			valeur: p.vidange,
			texte: `${nom} : la jauge adverse perd ${p.vidange}`
		});
	}
	if (p.reconfinementsAuto) moi.reconfinementsAuto += p.reconfinementsAuto;
	if (p.frappeLesDeux) {
		for (const c of [moi, lui]) c.integrite = Math.max(0, c.integrite - p.frappeLesDeux);
		ev.push({
			camp: auteur,
			type: "breche",
			valeur: p.frappeLesDeux,
			texte: `${nom} : la fin du monde, −${p.frappeLesDeux}`
		});
		ev.push({
			camp: auteur === "joueur" ? "ia" : "joueur",
			type: "breche",
			valeur: p.frappeLesDeux,
			texte: `${nom} : la fin du monde, −${p.frappeLesDeux}`
		});
	}
}
const DEGATS_BASE = .5;
/** Dégâts d'une anomalie qui fait brèche, ou de ce qu'elle inflige malgré tout une fois reconfinée */
function degatsAnomalie(a, r, issue) {
	const e = r.effet;
	if (r.actif && e.special === "inoffensif") return 0;
	let d = a.atk * DEGATS_BASE * r.attenuation;
	if (r.actif) {
		d *= e.force ?? 1;
		if (e.special === "lent") d *= .6 + Math.min(issue.temps, 20) / 20;
		if (e.special === "visage" && issue.regarde && !issue.reconfinee) d *= 3;
	}
	if (issue.reconfinee) d *= r.actif ? e.tenace ?? 0 : 0;
	return Math.round(d);
}
const nom = (c) => c.num ?? c.nm;
/**
* Applique la libération d'une anomalie de `auteur` chez `cible` (camps modifiés en place) ; renvoie les cartes
* à retirer de la main de la cible (dimension de poche).
*/
function appliquerLiberation(auteur, camps, anomalie, r, issue, evenements) {
	const cible = auteur === "joueur" ? "ia" : "joueur";
	const e = r.effet;
	const d = degatsAnomalie(anomalie, r, issue);
	if (issue.reconfinee) evenements.push({
		camp: cible,
		type: "reconfinement",
		valeur: d,
		texte: d ? `${nom(anomalie)} est reconfiné, mais inflige ${d}` : `${nom(anomalie)} est reconfiné`
	});
	else if (d > 0 || !(r.actif && e.special === "inoffensif")) evenements.push({
		camp: cible,
		type: "breche",
		valeur: d,
		texte: `${nom(anomalie)} fait brèche : ${d}`
	});
	camps[cible].integrite = Math.max(0, camps[cible].integrite - d);
	let poche = false;
	if (r.actif && !issue.reconfinee) {
		if (e.poison) {
			camps[cible].poison += e.poison;
			evenements.push({
				camp: cible,
				type: "poison",
				valeur: e.poison,
				texte: `Contamination : ${e.poison} par tour`
			});
		}
		if (e.special === "remede" || e.special === "inoffensif") {
			const soin = e.special === "remede" ? 15 : 20;
			camps[auteur].integrite = Math.min(150, camps[auteur].integrite + soin);
			evenements.push({
				camp: auteur,
				type: "soin",
				valeur: soin,
				texte: `${nom(anomalie)} : +${soin}`
			});
		}
		if (e.special === "poche") {
			poche = true;
			evenements.push({
				camp: cible,
				type: "poche",
				texte: `${nom(anomalie)} emporte une carte dans sa dimension de poche`
			});
		}
	}
	if (!issue.reconfinee) remplir(camps[auteur], 15);
	return { poche };
}
/** Une bonne réponse remplit la jauge, davantage si elle est rapide */
function gainReponse(juste, temps) {
	return juste ? temps <= 7 ? 35 : 25 : 0;
}
function remplir(camp, n) {
	if (!camp.manifeste) camp.manifestation = Math.min(100, camp.manifestation + n);
}
const termine = (tour, joueur, ia) => tour >= 8 || joueur.integrite <= 0 || ia.integrite <= 0;
function issueReco(joueur, ia) {
	if (joueur.integrite <= 0 && ia.integrite > 0) return "defaite";
	if (ia.integrite <= 0 && joueur.integrite > 0) return "victoire";
	return joueur.integrite > ia.integrite ? "victoire" : joueur.integrite < ia.integrite ? "defaite" : "nul";
}
const URGENCE = {
	id: "urgence",
	nom: "Protocole d’urgence O5",
	texte: "Le Conseil intervient : votre Site regagne 20 points."
};
const MANIFESTATIONS = {
	"entite:scarlet-king": {
		id: "chaines",
		nom: "Les chaînes du Roi",
		texte: "Deux cartes de la main adverse sont enchaînées jusqu’à la fin de la partie."
	},
	"dr-clef-s-proposal": {
		id: "patmos",
		nom: "Procédure Patmos-Omega",
		texte: "Le Site adverse perd 30 points et sa jauge retombe à zéro."
	},
	"fim:alpha-1": {
		id: "main-rouge",
		nom: "La Main droite rouge",
		texte: "Vos deux prochains reconfinements réussissent d’office."
	},
	"perso:the-administrator": {
		id: "reecriture",
		nom: "Réécriture",
		texte: "Votre Site regagne 35 points et toute contamination disparaît."
	},
	"perso:o5-1": {
		id: "veto",
		nom: "Veto",
		texte: "Le Site adverse perd 15 points, et votre prochain reconfinement réussit d’office."
	},
	"perso:aaron-siegel": {
		id: "revelation",
		nom: "Révélation",
		texte: "La vérité se développe : vos trois prochaines questions n’ont plus que deux réponses."
	},
	"scp-173": {
		id: "clignement",
		nom: "Clignement",
		texte: "Les deux prochaines questions adverses n’ont que 8 secondes."
	},
	"scp-2747": {
		id: "effacement",
		nom: "Effacement",
		texte: "L’adversaire rate d’office son prochain reconfinement : la page est effacée."
	}
};
/** La Manifestation d'une équipe : celle de sa première Mythique, sinon le Protocole d'urgence */
function manifestationDe(equipe) {
	const m = equipe.find((c) => c.ra === 5 && MANIFESTATIONS[c.id]);
	return m ? {
		...MANIFESTATIONS[m.id],
		carte: m.id
	} : URGENCE;
}
/** Applique une Manifestation (camps et mains modifiés en place) */
function manifester(m, auteur, camps, mains, hasard = Math.random) {
	const adverse = auteur === "joueur" ? "ia" : "joueur";
	const moi = camps[auteur];
	const lui = camps[adverse];
	moi.manifeste = true;
	moi.manifestation = 0;
	const ev = [{
		camp: auteur,
		type: "manifestation",
		texte: `${m.nom} : ${m.texte}`
	}];
	switch (m.id) {
		case "chaines":
			for (let i = 0; i < 2 && mains[adverse].length > 1; i++) mains[adverse].splice(Math.floor(hasard() * mains[adverse].length), 1);
			break;
		case "patmos":
			lui.integrite = Math.max(0, lui.integrite - 30);
			lui.manifestation = 0;
			break;
		case "main-rouge":
			moi.reconfinementsAuto += 2;
			break;
		case "reecriture":
			moi.integrite = Math.min(150, moi.integrite + 35);
			moi.poison = 0;
			break;
		case "veto":
			lui.integrite = Math.max(0, lui.integrite - 15);
			moi.reconfinementsAuto += 1;
			break;
		case "revelation":
			moi.questionsFaciles += 3;
			break;
		case "clignement":
			lui.questionsCourtes += 2;
			break;
		case "effacement":
			lui.echecsAuto += 1;
			break;
		default: moi.integrite = Math.min(150, moi.integrite + 20);
	}
	return ev;
}
/** Fin de tour : la contagion ronge, les effets à durée s'usent */
function finDeTour(camps, consommes, ev) {
	for (const x of ["joueur", "ia"]) {
		const c = camps[x];
		if (c.poison > 0 && c.integrite > 0) {
			c.integrite = Math.max(0, c.integrite - c.poison);
			ev.push({
				camp: x,
				type: "poison",
				valeur: c.poison,
				texte: `La contamination ronge le Site : −${c.poison}`
			});
		}
		for (const k of [
			"reconfinementsAuto",
			"questionsCourtes",
			"echecsAuto",
			"questionsFaciles"
		]) if (consommes[x][k] && c[k] > 0) c[k]--;
	}
}
/** Le choix de l'IA : une anomalie le plus souvent, un soutien quand elle est en danger ou devine une grosse menace */
function choisirIAReco(main, camp, finesse, hasard = Math.random) {
	const notes = main.map((c) => {
		let v = nature(c) === "anomalie" ? c.atk * (effetDe(c).force ?? 1) + (effetDe(c).alteration ? 12 : 0) : c.def * .6;
		if (nature(c) === "soutien" && soutien(c) === "site") v = camp.integrite < 60 ? c.def * 1.2 : 15;
		v *= 1 - (1 - finesse) * hasard();
		return {
			c,
			v
		};
	});
	notes.sort((a, b) => b.v - a.v);
	return notes[0].c;
}
// serveur/jcjReco.ts
const autre$1 = (c) => c === "a" ? "b" : "a";
const COTES$1 = ["a", "b"];
/** Le moteur parle de « joueur » et d'« ia » : ici, a et b */
const cote = (x) => x === "joueur" ? "a" : "b";
const camp = (c) => c === "a" ? "joueur" : "ia";
const estReco = (etat) => etat?.mode === "reco";
function etatInitialReco(equipes, langue, b, maintenant) {
	return {
		etat: {
			mode: "reco",
			tour: 1,
			phase: "choix",
			echeance: maintenant + 25e3,
			maintenant,
			camps: {
				a: campReco(),
				b: campReco()
			},
			mains: {
				a: [...equipes.a],
				b: [...equipes.b]
			},
			manifestations: {
				a: manifestationDe(equipes.a.map((id) => b.parId.get(id))),
				b: manifestationDe(equipes.b.map((id) => b.parId.get(id)))
			},
			choisi: {
				a: false,
				b: false
			},
			repondu: {
				a: false,
				b: false
			}
		},
		secret: {
			langue,
			choix: {},
			bonnes: {},
			recos: {},
			reponses: {}
		}
	};
}
function aRetirer$1(options, bonne, n) {
	const mauvaises = options.map((_, i) => i).filter((i) => i !== bonne);
	const retirees = [];
	while (retirees.length < n && mauvaises.length) retirees.push(mauvaises.splice(Math.floor(Math.random() * mauvaises.length), 1)[0]);
	return retirees;
}
/** Les deux cartes sont choisies : on les révèle et chacun reçoit son reconfinement */
function lancer(etat, secret, b, maintenant) {
	const cartes = {
		a: secret.choix.a,
		b: secret.choix.b
	};
	etat.cartes = cartes;
	etat.recos = {};
	secret.recos = {};
	secret.bonnes = {};
	secret.reponses = {};
	let duree = 0;
	for (const x of COTES$1) {
		const anomalie = b.parId.get(cartes[autre$1(x)]);
		if (nature(anomalie) !== "anomalie") continue;
		const r = preparerReconfinement(anomalie, etat.camps[x], b.parId.get(cartes[x]));
		secret.recos[x] = r;
		const pub = {
			effet: r.effet,
			alteree: r.alteree,
			actif: r.actif,
			auto: r.auto
		};
		if (!r.auto) {
			const q = questionReconfinement(b, anomalie);
			const retirees = aRetirer$1(q.options, q.bonne, r.retirees);
			const options = r.alteree && r.effet.alteration === "echo" ? appliquerEcho(q.options, q.bonne, retirees) : q.options;
			pub.question = {
				intitule: q.intitule,
				document: q.document,
				options,
				retirees,
				duree: r.duree
			};
			secret.bonnes[x] = q.bonne;
			duree = Math.max(duree, r.duree);
		}
		etat.recos[x] = pub;
	}
	etat.repondu = {
		a: secret.bonnes.a === void 0,
		b: secret.bonnes.b === void 0
	};
	if (etat.repondu.a && etat.repondu.b) return resoudre$2(etat, secret, b, maintenant);
	etat.phase = "question";
	etat.echeance = maintenant + duree * 1e3;
	secret.debut = maintenant;
}
/** Fin du tour : libérations, soutiens, jauges, contagion ; puis tour suivant ou fin du duel */
function resoudre$2(etat, secret, b, maintenant) {
	const cartes = etat.cartes;
	const C = {
		joueur: { ...etat.camps.a },
		ia: { ...etat.camps.b }
	};
	const mains = {
		joueur: etat.mains.a.filter((x) => x !== cartes.a),
		ia: etat.mains.b.filter((x) => x !== cartes.b)
	};
	const ev = [];
	const consommes = {
		joueur: {},
		ia: {}
	};
	for (const x of COTES$1) {
		const c = b.parId.get(cartes[x]);
		if (nature(c) === "soutien" && soutien(c) === "site") {
			const v = Math.round(c.def * .4);
			C[camp(x)].integrite = Math.min(150, C[camp(x)].integrite + v);
			ev.push({
				camp: camp(x),
				type: "soin",
				valeur: v,
				texte: `${c.num ?? c.nm} renforce le Site : +${v}`
			});
		}
	}
	const reponses = {};
	for (const x of COTES$1) {
		const y = autre$1(x);
		const r = secret.recos[y];
		if (!r) continue;
		const anomalie = b.parId.get(cartes[x]);
		const rep = secret.reponses[y];
		const bonne = secret.bonnes[y];
		const issue = r.auto ? {
			reconfinee: r.auto === "reussite",
			temps: 0
		} : {
			reconfinee: !!rep && rep.choix === bonne,
			temps: rep?.temps ?? r.duree,
			regarde: rep?.regarde
		};
		if (!r.auto && bonne !== void 0) reponses[y] = {
			choix: rep?.choix ?? null,
			bonne,
			temps: issue.temps
		};
		const { poche } = appliquerLiberation(camp(x), C, anomalie, r, issue, ev);
		if (poche && mains[camp(y)].length) mains[camp(y)].splice(Math.floor(Math.random() * mains[camp(y)].length), 1);
		if (issue.reconfinee) mains[camp(x)].push(anomalie.id);
		if (!r.auto) remplir(C[camp(y)], gainReponse(issue.reconfinee, issue.temps));
		for (const k of [
			"reconfinementsAuto",
			"questionsCourtes",
			"echecsAuto",
			"questionsFaciles"
		]) consommes[camp(y)][k] = true;
	}
	finDeTour(C, consommes, ev);
	for (const x of COTES$1) {
		const c = b.parId.get(cartes[x]);
		if (nature(c) === "soutien" && soutien(c) === "protocole") appliquerProtocole(c, camp(x), C, ev);
	}
	etat.camps = {
		a: C.joueur,
		b: C.ia
	};
	etat.mains = {
		a: mains.joueur,
		b: mains.ia
	};
	etat.dernier = {
		tour: etat.tour,
		cartes,
		evenements: ev.map((e) => ({
			...e,
			cote: cote(e.camp)
		})),
		reponses
	};
	etat.recos = void 0;
	etat.cartes = void 0;
	secret.choix = {};
	secret.bonnes = {};
	secret.recos = {};
	secret.reponses = {};
	secret.debut = void 0;
	if (termine(etat.tour, C.joueur, C.ia) || !mains.joueur.length || !mains.ia.length) {
		const issue = issueReco(C.joueur, C.ia);
		etat.phase = "fin";
		etat.fin = { issue: issue === "victoire" ? "a" : issue === "defaite" ? "b" : "nul" };
		return;
	}
	etat.tour++;
	etat.phase = "choix";
	etat.choisi = {
		a: false,
		b: false
	};
	etat.repondu = {
		a: false,
		b: false
	};
	etat.echeance = maintenant + 3e4;
}
function choisirReco(etat, secret, c, idCarte, b, maintenant) {
	if (etat.phase !== "choix") throw new Erreur(409, "Ce n'est pas le moment de jouer une carte");
	if (etat.choisi[c]) throw new Erreur(409, "Carte déjà jouée pour ce tour");
	if (!etat.mains[c].includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main");
	secret.choix[c] = idCarte;
	etat.choisi[c] = true;
	if (etat.choisi.a && etat.choisi.b) lancer(etat, secret, b, maintenant);
}
function repondreReco(etat, secret, c, choix, regarde, b, maintenant) {
	const q = etat.recos?.[c]?.question;
	if (etat.phase !== "question" || !q || secret.debut === void 0) throw new Erreur(409, "Aucun reconfinement en cours");
	if (etat.repondu[c]) throw new Erreur(409, "Vous avez déjà répondu");
	const ecoule = (maintenant - secret.debut) / 1e3;
	const valide = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && !q.retirees.includes(choix) && ecoule <= q.duree + 3;
	secret.reponses[c] = {
		choix: valide ? choix : null,
		temps: Math.min(q.duree, ecoule),
		regarde
	};
	etat.repondu[c] = true;
	if (etat.repondu.a && etat.repondu.b) resoudre$2(etat, secret, b, maintenant);
}
function manifesterJcj(etat, secret, c) {
	if (etat.phase !== "choix") throw new Erreur(409, "Pas pendant un reconfinement");
	if (etat.camps[c].manifeste || etat.camps[c].manifestation < 100) throw new Erreur(409, "La jauge de Manifestation n’est pas pleine");
	const C = {
		joueur: { ...etat.camps.a },
		ia: { ...etat.camps.b }
	};
	const garde = (x) => etat.mains[x].filter((id) => id !== secret.choix[x]);
	const mains = {
		joueur: garde("a"),
		ia: garde("b")
	};
	manifester(etat.manifestations[c], camp(c), C, mains);
	for (const x of COTES$1) if (secret.choix[x]) mains[camp(x)].push(secret.choix[x]);
	etat.camps = {
		a: C.joueur,
		b: C.ia
	};
	etat.mains = {
		a: mains.joueur,
		b: mains.ia
	};
	etat.manifestee = {
		cote: c,
		m: etat.manifestations[c],
		n: (etat.manifestee?.n ?? 0) + 1
	};
}
/** Les délais dépassés : carte jouée d'office, reconfinement sans réponse. Renvoie true si l'état a changé. */
function appliquerDelaisReco(etat, secret, b, maintenant) {
	if (etat.phase === "choix" && maintenant > etat.echeance) {
		for (const c of COTES$1) if (!etat.choisi[c]) {
			secret.choix[c] = etat.mains[c][0];
			etat.choisi[c] = true;
		}
		lancer(etat, secret, b, maintenant);
		return true;
	}
	if (etat.phase === "question" && maintenant > etat.echeance + 3e3) {
		for (const c of COTES$1) if (!etat.repondu[c]) {
			secret.reponses[c] = {
				choix: null,
				temps: etat.recos?.[c]?.question?.duree ?? 20,
				regarde: false
			};
			etat.repondu[c] = true;
		}
		resoudre$2(etat, secret, b, maintenant);
		return true;
	}
	return false;
}
// serveur/jcj.ts
const autre = (c) => c === "a" ? "b" : "a";
const COTES = ["a", "b"];
const restantes = (etat, secret, cote) => secret.mains[cote].filter((id) => !etat.jouees[cote].includes(id));
/** Côté dont la carte fait l'objet de la question : chacun son tour (3 manches contre 2 sur un duel complet). */
function sujetDeLaManche(secret, manche) {
	const premier = secret.premier ?? "a";
	return manche % 2 === 1 ? premier : autre(premier);
}
/** Les deux cartes sont choisies : même question pour les deux joueurs, sur l'une des deux cartes. */
function lancerQuestion(etat, secret, b, maintenant) {
	const carte = {
		a: b.parId.get(secret.carte.a),
		b: b.parId.get(secret.carte.b)
	};
	const surCarteDe = sujetDeLaManche(secret, etat.manche);
	const q = genererQuestion(b, carte[surCarteDe], carte[autre(surCarteDe)], false);
	etat.phase = "question";
	etat.question = {
		intitule: q.intitule,
		document: q.document,
		options: q.options,
		surCarteDe
	};
	etat.repondu = {
		a: false,
		b: false
	};
	etat.echeance = maintenant + 2e4;
	secret.question = { bonne: q.bonne };
	secret.debut = maintenant;
	secret.reponses = {};
}
/** Fin de manche : dégâts, cartes jouées, puis manche suivante ou fin du duel. */
function resoudre$1(etat, secret, b, maintenant) {
	const q = etat.question;
	const bonne = secret.question.bonne;
	const rep = {
		a: secret.reponses.a,
		b: secret.reponses.b
	};
	const carte = {
		a: b.parId.get(secret.carte.a),
		b: b.parId.get(secret.carte.b)
	};
	const ok = {
		a: rep.a.choix === bonne,
		b: rep.b.choix === bonne
	};
	const tousDeux = ok.a && ok.b;
	const inflige = {
		a: ok.a ? degats(carte.a, carte.b, rep.a.temps, tousDeux && rep.a.temps < rep.b.temps) : 0,
		b: ok.b ? degats(carte.b, carte.a, rep.b.temps, tousDeux && rep.b.temps < rep.a.temps) : 0
	};
	etat.pv = {
		a: etat.pv.a - inflige.b,
		b: etat.pv.b - inflige.a
	};
	etat.jouees = {
		a: [...etat.jouees.a, carte.a.id],
		b: [...etat.jouees.b, carte.b.id]
	};
	etat.dernier = {
		manche: etat.manche,
		intitule: q.intitule,
		options: q.options,
		bonne,
		choix: {
			a: rep.a.choix,
			b: rep.b.choix
		},
		temps: {
			a: rep.a.temps,
			b: rep.b.temps
		},
		degats: {
			a: inflige.b,
			b: inflige.a
		},
		cartes: {
			a: carte.a.id,
			b: carte.b.id
		}
	};
	etat.question = void 0;
	secret.question = void 0;
	secret.debut = void 0;
	secret.carte = {};
	secret.reponses = {};
	if (etat.manche >= 5 || etat.pv.a <= 0 || etat.pv.b <= 0) {
		etat.phase = "fin";
		etat.fin = { issue: etat.pv.a > etat.pv.b ? "a" : etat.pv.a < etat.pv.b ? "b" : "nul" };
		return;
	}
	etat.manche++;
	etat.phase = "choix";
	etat.choisi = {
		a: false,
		b: false
	};
	etat.repondu = {
		a: false,
		b: false
	};
	etat.echeance = maintenant + 24e3;
}
function choisir(etat, secret, cote, idCarte, b, maintenant) {
	if (etat.phase !== "choix") throw new Erreur(409, "Ce n'est pas le moment de choisir une carte");
	if (etat.choisi[cote]) throw new Erreur(409, "Carte déjà choisie pour cette manche");
	if (!restantes(etat, secret, cote).includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main");
	secret.carte[cote] = idCarte;
	etat.choisi[cote] = true;
	if (etat.choisi.a && etat.choisi.b) lancerQuestion(etat, secret, b, maintenant);
}
function repondre$2(etat, secret, cote, choix, b, maintenant) {
	if (etat.phase !== "question" || !etat.question || secret.debut === void 0) throw new Erreur(409, "Aucune question en cours");
	if (etat.repondu[cote]) throw new Erreur(409, "Vous avez déjà répondu");
	const ecoule = (maintenant - secret.debut) / 1e3;
	const valide = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < etat.question.options.length && ecoule <= 23;
	secret.reponses[cote] = {
		choix: valide ? choix : null,
		temps: Math.min(20, ecoule)
	};
	etat.repondu[cote] = true;
	if (etat.repondu.a && etat.repondu.b) resoudre$1(etat, secret, b, maintenant);
}
/** Applique les délais dépassés : carte jouée d'office, question sans réponse. Renvoie true si l'état a changé. */
function appliquerDelais(etat, secret, b, maintenant) {
	if (etat.phase === "choix" && maintenant > etat.echeance) {
		for (const c of COTES) if (!etat.choisi[c]) {
			secret.carte[c] = restantes(etat, secret, c)[0];
			etat.choisi[c] = true;
		}
		lancerQuestion(etat, secret, b, maintenant);
		return true;
	}
	if (etat.phase === "question" && maintenant > etat.echeance + 3e3) {
		for (const c of COTES) if (!etat.repondu[c]) {
			secret.reponses[c] = {
				choix: null,
				temps: 20
			};
			etat.repondu[c] = true;
		}
		resoudre$1(etat, secret, b, maintenant);
		return true;
	}
	return false;
}
async function lire$2(env, idDuel, idJoueur) {
	const lu = await rpc(env, "jcj_lire", {
		p_duel: idDuel,
		p_joueur: idJoueur
	});
	if (!lu) throw new Erreur(404, "Duel introuvable");
	return {
		...lu,
		cote: lu.joueurA === idJoueur ? "a" : "b"
	};
}
async function initialiser(env, prep, maintenant) {
	const b = await base(env, prep.langue);
	if ([...prep.equipeA, ...prep.equipeB].some((id) => !b.parId.has(id))) throw new Erreur(409, "Nouvelles fiches disponibles : rechargez la page");
	const { etat, secret } = etatInitialReco({
		a: prep.equipeA,
		b: prep.equipeB
	}, prep.langue, b, maintenant);
	await rpc(env, "jcj_ecrire", {
		p_duel: prep.id,
		p_version: 0,
		p_etat: etat,
		p_secret: secret
	});
}
/** Ce que voit un joueur : l'état public, sa propre main restante, et ses gains si le duel est fini. */
function vue(lu, id) {
	const moi = lu.cote;
	if (estReco(lu.etat)) {
		const secret = lu.secret;
		return {
			id,
			cote: moi,
			classe: lu.classe,
			statut: lu.statut,
			moi: {
				pseudo: moi === "a" ? lu.pseudoA : lu.pseudoB,
				elo: moi === "a" ? lu.eloA : lu.eloB
			},
			adversaire: {
				pseudo: moi === "a" ? lu.pseudoB : lu.pseudoA,
				elo: moi === "a" ? lu.eloB : lu.eloA
			},
			etat: lu.etat,
			main: lu.etat.mains[moi],
			maCarte: secret?.choix[moi] ?? null,
			gains: lu.resultat?.[moi] ?? null
		};
	}
	const etat = lu.etat;
	const secretClassique = lu.secret;
	return {
		id,
		cote: moi,
		classe: lu.classe,
		statut: lu.statut,
		moi: {
			pseudo: moi === "a" ? lu.pseudoA : lu.pseudoB,
			elo: moi === "a" ? lu.eloA : lu.eloB
		},
		adversaire: {
			pseudo: moi === "a" ? lu.pseudoB : lu.pseudoA,
			elo: moi === "a" ? lu.eloB : lu.eloA
		},
		etat,
		main: secretClassique && etat.jouees ? secretClassique.mains[moi].filter((c) => !etat.jouees[moi].includes(c)) : [],
		maCarte: secretClassique?.carte[moi] ?? null,
		gains: lu.resultat?.[moi] ?? null
	};
}
/**
* Lit le duel, applique les délais dépassés puis la modification demandée, et écrit. Si l'autre joueur a écrit
* entre-temps (version changée), on relit et on recommence. Un duel qui se termine est clos ici : Elo et gains.
*/
async function modifier(env, idDuel, idJoueur, maintenant, action) {
	for (let essai = 0; essai < 4; essai++) {
		const lu = await lire$2(env, idDuel, idJoueur);
		if (lu.statut !== "en_cours" || !lu.secret) return {
			lu,
			profil: null
		};
		const etat = structuredClone(lu.etat);
		const secret = structuredClone(lu.secret);
		const b = await base(env, secret.langue);
		let change = estReco(etat) ? appliquerDelaisReco(etat, secret, b, maintenant) : appliquerDelais(etat, secret, b, maintenant);
		if (action && etat.phase !== "fin") change = action(etat, secret, lu.cote, b) !== false || change;
		if (!change) return {
			lu,
			profil: null
		};
		etat.maintenant = maintenant;
		if (etat.phase === "fin") try {
			const gains = await rpc(env, "jcj_clore", {
				p_duel: idDuel,
				p_version: lu.version,
				p_etat: etat,
				p_issue: etat.fin.issue
			});
			return {
				lu: await lire$2(env, idDuel, idJoueur),
				profil: gains[lu.cote].profil
			};
		} catch (e) {
			if (essai < 3 && e instanceof Erreur && /déjà terminé/.test(e.message)) continue;
			throw e;
		}
		if (await rpc(env, "jcj_ecrire", {
			p_duel: idDuel,
			p_version: lu.version,
			p_etat: etat,
			p_secret: secret
		})) return {
			lu: {
				...lu,
				etat,
				secret,
				version: lu.version + 1
			},
			profil: null
		};
	}
	throw new Erreur(409, "Le duel a changé entre-temps : réessayez");
}
const ACTIONS_JCJ = /* @__PURE__ */ new Set([
	"jcj_file",
	"jcj_quitter",
	"jcj_defier",
	"jcj_repondre_defi",
	"jcj_etat",
	"jcj_jouer",
	"jcj_repondre",
	"jcj_manifester",
	"jcj_abandonner"
]);
async function etatDuel(env, idDuel, idJoueur, maintenant) {
	let lu = await lire$2(env, idDuel, idJoueur);
	if (lu.statut === "preparation" && lu.version === 0) {
		try {
			await initialiser(env, await rpc(env, "jcj_preparer", {
				p_duel: idDuel,
				p_joueur: idJoueur
			}), maintenant);
		} catch (e) {
			if (!(e instanceof Erreur && e.statut === 409)) throw e;
		}
		lu = await lire$2(env, idDuel, idJoueur);
	}
	const { lu: apres, profil } = await modifier(env, idDuel, idJoueur, maintenant);
	return {
		...vue(apres, idDuel),
		profil
	};
}
async function traiterJcj(env, idJoueur, action, corps, maintenant) {
	const idDuel = texte(corps.id);
	switch (action) {
		case "jcj_file": {
			const r = await rpc(env, "jcj_entrer_file", { p_joueur: idJoueur });
			if (r.preparer) {
				await initialiser(env, r.preparer, maintenant);
				return { duel: await etatDuel(env, r.preparer.id, idJoueur, maintenant) };
			}
			if (r.enCours) return { duel: await etatDuel(env, r.enCours, idJoueur, maintenant) };
			return {
				attente: true,
				enFile: r.enFile ?? 1
			};
		}
		case "jcj_quitter":
			await rpc(env, "jcj_quitter_file", { p_joueur: idJoueur });
			return { ok: true };
		case "jcj_defier": return rpc(env, "jcj_defier", {
			p_joueur: idJoueur,
			p_pseudo: texte(corps.pseudo)
		});
		case "jcj_repondre_defi": {
			const r = await rpc(env, "jcj_repondre_defi", {
				p_joueur: idJoueur,
				p_duel: idDuel,
				p_accepter: corps.accepter === true
			});
			if (!r.preparer) return { refuse: true };
			await initialiser(env, r.preparer, maintenant);
			return { duel: await etatDuel(env, idDuel, idJoueur, maintenant) };
		}
		case "jcj_etat": return etatDuel(env, idDuel, idJoueur, maintenant);
		case "jcj_jouer": {
			const idCarte = texte(corps.carte);
			const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote, b) => estReco(etat) ? choisirReco(etat, secret, cote, idCarte, b, maintenant) : choisir(etat, secret, cote, idCarte, b, maintenant));
			return {
				...vue(lu, idDuel),
				profil
			};
		}
		case "jcj_repondre": {
			const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote, b) => estReco(etat) ? repondreReco(etat, secret, cote, corps.choix, corps.regarde === true, b, maintenant) : repondre$2(etat, secret, cote, corps.choix, b, maintenant));
			return {
				...vue(lu, idDuel),
				profil
			};
		}
		case "jcj_manifester": {
			const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote) => {
				if (!estReco(etat)) throw new Erreur(409, "Pas de Manifestation dans ce duel");
				manifesterJcj(etat, secret, cote);
			});
			return {
				...vue(lu, idDuel),
				profil
			};
		}
		case "jcj_abandonner": {
			const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, _secret, cote) => {
				etat.phase = "fin";
				etat.fin = {
					issue: autre(cote),
					abandon: cote
				};
			});
			return {
				...vue(lu, idDuel),
				profil
			};
		}
	}
	throw new Erreur(400, "Action inconnue");
}
// serveur/reconfinement.ts
const ACTIONS_RECO = /* @__PURE__ */ new Set([
	"reco_debuter",
	"reco_jouer",
	"reco_repondre",
	"reco_manifester"
]);
async function lire$1(env, id, joueur) {
	const r = await rpc(env, "duel_lire", {
		p_duel: id,
		p_joueur: joueur
	});
	if (!r?.etat || r.etat.mode !== "reco") throw new Erreur(404, "Confrontation introuvable ou déjà terminée");
	return {
		etat: r.etat,
		version: r.version
	};
}
async function ecrire$1(env, id, joueur, version, etat) {
	if (!await rpc(env, "duel_ecrire", {
		p_duel: id,
		p_joueur: joueur,
		p_version: version,
		p_etat: etat
	})) throw new Erreur(409, "La confrontation a changé entre-temps : rechargez la page");
}
const adversaireDe = (niveau) => ADVERSAIRES.find((a) => a.niveau === niveau);
function vuePublique(etat, b) {
	return {
		tour: etat.tour,
		main: etat.main,
		cartesIA: etat.mainIA.length,
		mainIA: etat.mainIA,
		joueur: etat.joueur,
		ia: etat.ia,
		bonnes: etat.bonnes,
		manifestation: manifestationDe(etat.equipe.map((id) => b.parId.get(id)))
	};
}
async function debuter$1(env, idJoueur, corps) {
	const adversaire = ADVERSAIRES.find((a) => a.niveau === corps.niveau);
	if (!adversaire) throw new Erreur(400, "Adversaire inconnu");
	const prep = await rpc(env, "duel_preparer", {
		p_joueur: idJoueur,
		p_niveau: adversaire.niveau
	});
	const b = await base(env, prep.langue);
	if (prep.equipe.some((id) => !b.parId.has(id))) throw new Erreur(409, "Nouvelles fiches disponibles : rechargez la page");
	const effets = effetsEquipe(prep.equipe.map((id) => b.parId.get(id)));
	const etat = {
		mode: "reco",
		niveau: adversaire.niveau,
		langue: prep.langue,
		equipe: prep.equipe,
		main: prep.equipe,
		mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
		tour: 1,
		joueur: {
			...campReco(),
			integrite: campReco().integrite + effets.integrite
		},
		ia: campReco(),
		bonnes: 0,
		questions: 0,
		phase: "choix",
		revele: false,
		bonus: effets.temps,
		retrait: effets.retrait,
		hesitation: effets.hesitation
	};
	await ecrire$1(env, prep.id, idJoueur, 0, etat);
	return {
		id: prep.id,
		...vuePublique(etat, b)
	};
}
/** Retire `n` mauvaises réponses au hasard */
function aRetirer(options, bonne, n) {
	const mauvaises = options.map((_, i) => i).filter((i) => i !== bonne);
	const retirees = [];
	while (retirees.length < n && mauvaises.length) retirees.push(mauvaises.splice(Math.floor(Math.random() * mauvaises.length), 1)[0]);
	return retirees;
}
async function jouer$1(env, idJoueur, corps, maintenant) {
	const id = texte(corps.id);
	const { etat, version } = await lire$1(env, id, idJoueur);
	if (etat.phase !== "choix") throw new Erreur(409, "Un reconfinement attend votre réponse");
	const idCarte = texte(corps.carte);
	if (!etat.main.includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main");
	const b = await base(env, etat.langue);
	const adversaire = adversaireDe(etat.niveau);
	const carte = b.parId.get(idCarte);
	const carteIA = choisirIAReco(etat.mainIA.map((x) => b.parId.get(x)), etat.ia, adversaire.precision);
	let recoIA;
	let reponseIA;
	if (nature(carte) === "anomalie") {
		recoIA = preparerReconfinement(carte, etat.ia, carteIA);
		if (recoIA.auto) reponseIA = {
			juste: recoIA.auto === "reussite",
			temps: 0
		};
		else {
			const q = questionReconfinement(b, carte);
			const malus = (recoIA.alteree ? .15 : 0) - recoIA.retirees * .1;
			const r = reponseAdversaire({
				...adversaire,
				precision: Math.max(.15, adversaire.precision - malus)
			}, q);
			const t = r.temps + (etat.hesitation ?? 0);
			reponseIA = {
				juste: r.choix === q.bonne && t <= recoIA.duree,
				temps: Math.min(t, recoIA.duree)
			};
		}
	}
	const suivant = {
		...etat,
		coup: idCarte,
		coupIA: carteIA.id,
		recoIA,
		reponseIA
	};
	const revelation = {
		carteIA: carteIA.id,
		tempsIA: reponseIA && !recoIA?.auto ? reponseIA.temps : void 0
	};
	if (nature(carteIA) === "anomalie") {
		const reco = preparerReconfinement(carteIA, etat.joueur, carte);
		if (!reco.auto) {
			const q = questionReconfinement(b, carteIA);
			const retirees = aRetirer(q.options, q.bonne, reco.retirees + (etat.retrait && etat.questions === 0 ? 1 : 0));
			const options = reco.alteree && reco.effet.alteration === "echo" ? appliquerEcho(q.options, q.bonne, retirees) : q.options;
			const duree = reco.duree + (etat.bonus ?? 0);
			const question = {
				intitule: q.intitule,
				document: q.document,
				options,
				bonne: q.bonne,
				retirees,
				duree
			};
			await ecrire$1(env, id, idJoueur, version, {
				...suivant,
				phase: "question",
				question,
				reco,
				debut: maintenant
			});
			return {
				...revelation,
				question: {
					intitule: q.intitule,
					document: q.document,
					options,
					retirees,
					duree
				},
				reco: {
					effet: reco.effet,
					alteree: reco.alteree,
					actif: reco.actif
				}
			};
		}
		const res = await resoudre(env, id, idJoueur, version, {
			...suivant,
			reco
		}, b, {
			reconfinee: reco.auto === "reussite",
			temps: 0
		}, null);
		return {
			...revelation,
			auto: reco.auto,
			resultat: res
		};
	}
	const res = await resoudre(env, id, idJoueur, version, suivant, b, null, null);
	return {
		...revelation,
		resultat: res
	};
}
async function repondre$1(env, idJoueur, corps, maintenant) {
	const id = texte(corps.id);
	const { etat, version } = await lire$1(env, id, idJoueur);
	if (etat.phase !== "question" || !etat.question || !etat.reco || etat.debut === void 0) throw new Erreur(409, "Aucun reconfinement en cours");
	const q = etat.question;
	const ecoule = (maintenant - etat.debut) / 1e3;
	const choix = corps.choix;
	const choixRetenu = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && !q.retirees.includes(choix) && ecoule <= q.duree + 3 ? choix : null;
	const temps = Math.min(q.duree, ecoule);
	const juste = choixRetenu === q.bonne;
	return await resoudre(env, id, idJoueur, version, etat, await base(env, etat.langue), {
		reconfinee: juste,
		temps,
		regarde: corps.regarde === true
	}, {
		choix: choixRetenu,
		bonne: q.bonne
	});
}
/** Résout le tour : libérations, soutiens, jauges, contagion, Manifestation de l'IA ; clôt la partie à la fin */
async function resoudre(env, id, idJoueur, version, etat, b, issueJoueur, reponse) {
	const carte = b.parId.get(etat.coup);
	const carteIA = b.parId.get(etat.coupIA);
	const camps = {
		joueur: { ...etat.joueur },
		ia: { ...etat.ia }
	};
	const mains = {
		joueur: etat.main.filter((x) => x !== carte.id),
		ia: etat.mainIA.filter((x) => x !== carteIA.id)
	};
	const evenements = [];
	const consommes = {
		joueur: {},
		ia: {}
	};
	for (const [x, c] of [["joueur", carte], ["ia", carteIA]]) if (nature(c) === "soutien" && soutien(c) === "site") {
		const v = Math.round(c.def * .4);
		camps[x].integrite = Math.min(150, camps[x].integrite + v);
		evenements.push({
			camp: x,
			type: "soin",
			valeur: v,
			texte: `${c.num ?? c.nm} renforce le Site : +${v}`
		});
	}
	const poche = (x) => {
		if (mains[x].length) mains[x].splice(Math.floor(Math.random() * mains[x].length), 1);
	};
	if (etat.recoIA && etat.reponseIA) {
		if (appliquerLiberation("joueur", camps, carte, etat.recoIA, {
			reconfinee: etat.reponseIA.juste,
			temps: etat.reponseIA.temps
		}, evenements).poche) poche("ia");
		if (etat.reponseIA.juste) mains.joueur.push(carte.id);
		if (!etat.recoIA.auto) remplir(camps.ia, gainReponse(etat.reponseIA.juste, etat.reponseIA.temps));
		for (const k of [
			"reconfinementsAuto",
			"questionsCourtes",
			"echecsAuto",
			"questionsFaciles"
		]) consommes.ia[k] = true;
	}
	if (etat.reco && issueJoueur) {
		if (appliquerLiberation("ia", camps, carteIA, etat.reco, issueJoueur, evenements).poche) poche("joueur");
		if (issueJoueur.reconfinee) mains.ia.push(carteIA.id);
		if (reponse) remplir(camps.joueur, gainReponse(issueJoueur.reconfinee, issueJoueur.temps));
		for (const k of [
			"reconfinementsAuto",
			"questionsCourtes",
			"echecsAuto",
			"questionsFaciles"
		]) consommes.joueur[k] = true;
	}
	finDeTour(camps, consommes, evenements);
	for (const [x, c] of [["joueur", carte], ["ia", carteIA]]) if (nature(c) === "soutien" && soutien(c) === "protocole") appliquerProtocole(c, x, camps, evenements);
	if (camps.ia.manifestation >= 100 && !camps.ia.manifeste && camps.ia.integrite > 0) evenements.push(...manifester(URGENCE, "ia", camps, mains));
	const suivant = {
		...etat,
		phase: "choix",
		tour: etat.tour + 1,
		joueur: camps.joueur,
		ia: camps.ia,
		main: mains.joueur,
		mainIA: mains.ia,
		bonnes: etat.bonnes + (reponse && issueJoueur?.reconfinee ? 1 : 0),
		questions: etat.questions + (reponse ? 1 : 0),
		coup: void 0,
		coupIA: void 0,
		question: void 0,
		reco: void 0,
		recoIA: void 0,
		reponseIA: void 0,
		debut: void 0
	};
	const resultat = {
		choix: reponse?.choix ?? null,
		bonne: reponse?.bonne,
		temps: issueJoueur?.temps,
		reponseIA: etat.reponseIA,
		evenements
	};
	if (!termine(etat.tour, camps.joueur, camps.ia) && mains.joueur.length && mains.ia.length) {
		await ecrire$1(env, id, idJoueur, version, suivant);
		return {
			...resultat,
			...vuePublique(suivant, b),
			fin: null
		};
	}
	const issue = issueReco(camps.joueur, camps.ia);
	const questions = Math.min(5, Math.max(1, suivant.questions));
	const gains = await rpc(env, "duel_clore", {
		p_duel: id,
		p_joueur: idJoueur,
		p_version: version,
		p_etat: suivant,
		p_issue: issue,
		p_bonnes: Math.min(questions, suivant.bonnes),
		p_questions: questions
	});
	return {
		...resultat,
		...vuePublique(suivant, b),
		fin: {
			issue,
			...gains
		}
	};
}
async function manifesterJoueur(env, idJoueur, corps) {
	const id = texte(corps.id);
	const { etat, version } = await lire$1(env, id, idJoueur);
	if (etat.phase !== "choix") throw new Erreur(409, "Pas pendant un reconfinement");
	if (etat.joueur.manifeste || etat.joueur.manifestation < 100) throw new Erreur(409, "La jauge de Manifestation n’est pas pleine");
	const b = await base(env, etat.langue);
	const m = manifestationDe(etat.equipe.map((x) => b.parId.get(x)));
	const camps = {
		joueur: { ...etat.joueur },
		ia: { ...etat.ia }
	};
	const mains = {
		joueur: [...etat.main],
		ia: [...etat.mainIA]
	};
	const evenements = manifester(m, "joueur", camps, mains);
	const suivant = {
		...etat,
		joueur: camps.joueur,
		ia: camps.ia,
		main: mains.joueur,
		mainIA: mains.ia,
		revele: etat.revele || m.id === "revelation"
	};
	await ecrire$1(env, id, idJoueur, version, suivant);
	return {
		declenchee: m,
		evenements,
		...vuePublique(suivant, b)
	};
}
async function traiterReco(env, idJoueur, action, corps, maintenant) {
	switch (action) {
		case "reco_debuter": return debuter$1(env, idJoueur, corps);
		case "reco_jouer": return jouer$1(env, idJoueur, corps, maintenant);
		case "reco_manifester": return manifesterJoueur(env, idJoueur, corps);
		default: return repondre$1(env, idJoueur, corps, maintenant);
	}
}
// serveur/push.ts
/**
* Notifications sur l'appareil (Web Push) : la file d'attente remplie par la base (prive.push_file) part vers les
* téléphones et ordinateurs abonnés. Appelée chaque minute par pg_cron et pg_net (action « push »), seulement quand la
* file n'est pas vide ; sans effet si on l'appelle à vide, d'où l'absence de jeton.
*
* Le chiffrement suit les normes du Web Push (RFC 8291, contenu « aes128gcm ») et l'identification du serveur, VAPID
* (RFC 8292), avec la seule WebCrypto : aucune bibliothèque, rien à installer sur la fonction Edge.
*/
const credits = (n) => `${Number(n ?? 0).toLocaleString("fr-FR")} ₵`;
const rang = (r) => `${r ?? "?"}${r === 1 ? "er" : "e"}`;
function contenu(type, d, b) {
	const c = typeof d.carte === "string" ? b?.parId.get(d.carte) : void 0;
	const nom = c ? designation(c) : "une carte";
	const variante = typeof d.variante === "string" && d.variante !== "std" ? " (variante)" : "";
	const marche = (onglet) => `/?ecran=marche&onglet=${onglet}`;
	switch (type) {
		case "souhait_en_vente": return {
			titre: "Carte souhaitée en vente",
			texte: `${nom}${variante} est en vente à partir de ${credits(d.prix)}.`,
			url: marche("encheres"),
			etiquette: `souhait:${d.enchere}`
		};
		case "surencheri": return {
			titre: "Vous êtes surenchéri",
			texte: `${d.par ?? "Un agent"} mise ${credits(d.mise)} sur ${nom}.`,
			url: marche("encheres"),
			etiquette: `enchere:${d.enchere}`
		};
		case "enchere_gagnee": return {
			titre: "Enchère remportée",
			texte: `${nom}${variante} est à vous pour ${credits(d.prix)}.`,
			url: "/?ecran=collection",
			etiquette: `enchere:${d.enchere}`
		};
		case "vente_conclue": return {
			titre: "Vente conclue",
			texte: `${nom} vendue à ${d.acheteur ?? "un agent"} pour ${credits(d.prix)}.`,
			url: marche("ventes"),
			etiquette: `vente:${d.enchere}`
		};
		case "vente_invendue": return {
			titre: "Vente sans preneur",
			texte: `${nom} revient dans vos archives.`,
			url: marche("ventes"),
			etiquette: `vente:${d.enchere}`
		};
		case "echange_recu": return {
			titre: "Proposition d’échange",
			texte: `${d.de ?? "Un agent"} vous propose un échange.`,
			url: marche("echanges"),
			etiquette: `echange:${d.offre}`
		};
		case "echange_accepte": return {
			titre: "Échange accepté",
			texte: `${d.avec ?? "L’agent"} a accepté votre échange.`,
			url: marche("echanges"),
			etiquette: `echange:${d.offre}`
		};
		case "echange_refuse": return {
			titre: "Échange refusé",
			texte: `${d.avec ?? "L’agent"} a refusé votre échange.`,
			url: marche("echanges"),
			etiquette: `echange:${d.offre}`
		};
		case "epreuve_resultat": return {
			titre: "Épreuve de la semaine",
			texte: `${rang(d.rang)} sur ${d.participants ?? "?"} avec ${d.score ?? 0} points : +${credits(d.credits)}.`,
			url: "/?ecran=duel",
			etiquette: "epreuve"
		};
		case "saison_resultat": return {
			titre: "Saison classée close",
			texte: `Vous finissez ${rang(d.rang)} : +${credits(d.credits)}.`,
			url: "/?ecran=classement",
			etiquette: "saison"
		};
		case "raid_vaincu": return {
			titre: "Raid réussi",
			texte: `${nom} est reconfiné. Réclamez votre part dans la page du clan.`,
			url: "/?ecran=social",
			etiquette: "raid"
		};
		case "dossiers_prets": return Number(d.nombre) >= 10 ? {
			titre: "Réserve pleine : 10 dossiers",
			texte: "Plus aucun dossier gratuit n’arrive tant que vous n’en ouvrez pas.",
			url: "/?ecran=booster",
			etiquette: "dossiers"
		} : {
			titre: "5 dossiers vous attendent",
			texte: "Votre réserve de dossiers gratuits se remplit.",
			url: "/?ecran=booster",
			etiquette: "dossiers"
		};
		case "essai": return {
			titre: "Notifications activées",
			texte: "Surenchères, offres d’échange, ventes et messages arriveront ici, même le jeu fermé.",
			url: "/",
			etiquette: "essai"
		};
		case "message": return {
			titre: `Message de ${d.de ?? "un agent"}`,
			texte: String(d.texte ?? ""),
			url: "/?ecran=social",
			etiquette: `message:${d.de}`
		};
		default: return {
			titre: "SCP Masters",
			texte: "Du nouveau au terminal.",
			url: "/",
			etiquette: type
		};
	}
}
const encodeur = new TextEncoder();
function enBase64Url(octets) {
	let s = "";
	for (const o of octets) s += String.fromCharCode(o);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function depuisBase64Url(texte) {
	const b = atob(texte.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - texte.length % 4) % 4));
	return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function concat(...parties) {
	const r = new Uint8Array(parties.reduce((n, p) => n + p.length, 0));
	let i = 0;
	for (const p of parties) {
		r.set(p, i);
		i += p.length;
	}
	return r;
}
async function hmac(cle, donnees) {
	const k = await crypto.subtle.importKey("raw", cle, {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return new Uint8Array(await crypto.subtle.sign("HMAC", k, donnees));
}
/** Chiffre le contenu pour un appareil : en-tête (sel, taille d'enregistrement, clé publique éphémère) puis le texte chiffré */
async function chiffrer(texte, appareil, sel = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(16))) {
	const cleAppareil = depuisBase64Url(appareil.p256dh);
	const secret = depuisBase64Url(appareil.auth);
	const ephemere = await crypto.subtle.generateKey({
		name: "ECDH",
		namedCurve: "P-256"
	}, true, ["deriveBits"]);
	const publiqueEphemere = new Uint8Array(await crypto.subtle.exportKey("raw", ephemere.publicKey));
	const publiqueAppareil = await crypto.subtle.importKey("raw", cleAppareil, {
		name: "ECDH",
		namedCurve: "P-256"
	}, false, []);
	const prk = await hmac(sel, await hmac(await hmac(secret, new Uint8Array(await crypto.subtle.deriveBits({
		name: "ECDH",
		public: publiqueAppareil
	}, ephemere.privateKey, 256))), concat(encodeur.encode("WebPush: info\0"), cleAppareil, publiqueEphemere, new Uint8Array([1]))));
	const cek = (await hmac(prk, concat(encodeur.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
	const nonce = (await hmac(prk, concat(encodeur.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
	const cle = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
	const clair = concat(encodeur.encode(texte), new Uint8Array([2]));
	const chiffre = new Uint8Array(await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv: nonce
	}, cle, clair));
	const entete = new Uint8Array(21 + publiqueEphemere.length);
	entete.set(sel, 0);
	new DataView(entete.buffer).setUint32(16, 4096);
	entete[20] = publiqueEphemere.length;
	entete.set(publiqueEphemere, 21);
	return concat(entete, chiffre);
}
async function lireCleVapid(jwk) {
	const j = JSON.parse(jwk);
	return {
		privee: await crypto.subtle.importKey("jwk", {
			...j,
			key_ops: ["sign"]
		}, {
			name: "ECDSA",
			namedCurve: "P-256"
		}, false, ["sign"]),
		publique: enBase64Url(concat(new Uint8Array([4]), depuisBase64Url(j.x ?? ""), depuisBase64Url(j.y ?? "")))
	};
}
async function enteteVapid(endpoint, cle, sujet) {
	const json = (o) => enBase64Url(encodeur.encode(JSON.stringify(o)));
	const corps = `${json({
		typ: "JWT",
		alg: "ES256"
	})}.${json({
		aud: new URL(endpoint).origin,
		exp: Math.floor(Date.now() / 1e3) + 43200,
		sub: sujet
	})}`;
	return `vapid t=${corps}.${enBase64Url(new Uint8Array(await crypto.subtle.sign({
		name: "ECDSA",
		hash: "SHA-256"
	}, cle.privee, encodeur.encode(corps))))}, k=${cle.publique}`;
}
/** Les services de notifications des navigateurs : Google (Chrome, Edge Android), Mozilla, Apple, Microsoft */
const SERVICES = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
function serviceConnu(endpoint) {
	return SERVICES.test(endpoint);
}
/**
* Envoie à un appareil ; renvoie le statut du service de notifications (201 : accepté ; 404 ou 410 : désabonné) et,
* en cas de refus, sa raison (Apple : {"reason": "…"})
*/
async function envoyer(appareil, c, cle, sujet) {
	if (!serviceConnu(appareil.endpoint)) return {
		statut: 410,
		raison: "service de notifications inconnu"
	};
	const corps = await chiffrer(JSON.stringify(c), appareil);
	const r = await fetch(appareil.endpoint, {
		method: "POST",
		redirect: "manual",
		headers: {
			Authorization: await enteteVapid(appareil.endpoint, cle, sujet),
			"Content-Encoding": "aes128gcm",
			"Content-Type": "application/octet-stream",
			TTL: "86400",
			Urgency: "normal"
		},
		body: corps
	});
	const raison = r.ok ? "" : (await r.text().catch(() => "")).slice(0, 160);
	if (r.ok) await r.body?.cancel().catch(() => void 0);
	return {
		statut: r.status,
		raison
	};
}
let cleVapid = null;
let enCours = null;
let dernierPassage = 0;
async function traiterPush(env, maintenant = Date.now()) {
	if (enCours) return enCours;
	if (maintenant - dernierPassage < 1e4) return {
		envoyes: 0,
		echecs: 0,
		desabonnes: 0,
		patienter: true
	};
	dernierPassage = maintenant;
	enCours = passerLaFile(env).finally(() => {
		enCours = null;
	});
	return enCours;
}
async function passerLaFile(env) {
	if (!env.vapid) {
		console.error("push : secret VAPID_JWK absent ou vide");
		return {
			envoyes: 0,
			echecs: 0,
			desabonnes: 0,
			cle: false
		};
	}
	cleVapid ??= lireCleVapid(env.vapid);
	const cle = await cleVapid;
	const lot = await rpc(env, "push_a_envoyer", {});
	if (!lot.length) return {
		envoyes: 0,
		echecs: 0,
		desabonnes: 0
	};
	const b = await base(env, "vf").catch(() => null);
	const desabonnes = [];
	const details = [];
	let envoyes = 0;
	let echecs = 0;
	await Promise.all(lot.flatMap((e) => e.appareils.map(async (a) => {
		const service = new URL(a.endpoint).host;
		try {
			const { statut, raison } = await envoyer(a, contenu(e.type, e.donnees, b), cle, env.site);
			details.push({
				type: e.type,
				service,
				statut,
				raison
			});
			if (statut === 404 || statut === 410) desabonnes.push(a.endpoint);
			else if (statut >= 200 && statut < 300) envoyes++;
			else echecs++;
		} catch (x) {
			details.push({
				type: e.type,
				service,
				statut: 0,
				raison: String(x).slice(0, 160)
			});
			echecs++;
		}
	})));
	if (desabonnes.length) await rpc(env, "push_expires", { p_endpoints: desabonnes });
	console.log("push", JSON.stringify(details));
	return {
		envoyes,
		echecs,
		desabonnes: desabonnes.length,
		details
	};
}
// serveur/duel.ts
/**
* Duels contre l'IA, arbitrés par le serveur (fonction Edge « duel ») ; les duels entre joueurs passent par
* la même fonction (serveur/jcj.ts).
* Le navigateur ne reçoit jamais la bonne réponse avant d'avoir répondu : c'est ici que se tirent le deck
* de l'IA et les questions, que se chronomètrent les réponses, que l'IA répond et que se calculent les
* dégâts et l'issue. Les règles sont celles de src/engine, partagées avec l'affichage.
* L'état de la partie est enregistré dans prive.duels_ia par les fonctions SQL duel_* (clé de service).
*/
async function lire(env, idDuel, idJoueur) {
	const r = await rpc(env, "duel_lire", {
		p_duel: idDuel,
		p_joueur: idJoueur
	});
	if (!r?.etat || r.etat.mode) throw new Erreur(404, "Duel introuvable ou déjà terminé");
	return {
		etat: r.etat,
		version: r.version
	};
}
async function ecrire(env, idDuel, idJoueur, version, etat) {
	if (!await rpc(env, "duel_ecrire", {
		p_duel: idDuel,
		p_joueur: idJoueur,
		p_version: version,
		p_etat: etat
	})) throw new Erreur(409, "Le duel a changé entre-temps : rechargez la page");
}
const terminee = (e) => e.manche >= 5 || e.pv <= 0 || e.pvIA <= 0;
async function debuter(env, idJoueur, corps) {
	const adversaire = ADVERSAIRES.find((a) => a.niveau === corps.niveau);
	if (!adversaire) throw new Erreur(400, "Adversaire inconnu");
	const prep = await rpc(env, "duel_preparer", {
		p_joueur: idJoueur,
		p_niveau: adversaire.niveau
	});
	const b = await base(env, prep.langue);
	if (prep.equipe.some((id) => !b.parId.has(id))) throw new Erreur(409, "Nouvelles fiches disponibles : rechargez la page");
	const effets = effetsEquipe(prep.equipe.map((id) => b.parId.get(id)));
	const etat = {
		niveau: adversaire.niveau,
		langue: prep.langue,
		main: prep.equipe,
		mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
		manche: 1,
		pv: 100 + effets.integrite,
		pvIA: 100,
		bonnes: 0,
		phase: "choix",
		bonus: effets.temps,
		retrait: effets.retrait,
		hesitation: effets.hesitation
	};
	await ecrire(env, prep.id, idJoueur, 0, etat);
	return {
		id: prep.id,
		main: etat.main,
		cartesIA: etat.mainIA.length,
		manche: 1,
		pv: etat.pv,
		pvIA: etat.pvIA
	};
}
async function jouer(env, idJoueur, corps, maintenant) {
	const idDuel = texte(corps.id);
	const { etat, version } = await lire(env, idDuel, idJoueur);
	let manche = etat.manche;
	if (etat.phase === "resultat") {
		if (terminee(etat)) throw new Erreur(409, "Ce duel est terminé");
		manche++;
	} else if (etat.phase !== "choix") throw new Erreur(409, "Une question attend déjà votre réponse");
	const idCarte = texte(corps.carte);
	if (!etat.main.includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main");
	const b = await base(env, etat.langue);
	const adversaire = ADVERSAIRES.find((a) => a.niveau === etat.niveau);
	const carte = b.parId.get(idCarte);
	const idIA = etat.mainIA[Math.floor(Math.random() * etat.mainIA.length)];
	const carteIA = b.parId.get(idIA);
	const surMaCarte = Math.random() < .5;
	const q = surMaCarte ? genererQuestion(b, carte, carteIA, false) : genererQuestion(b, carteIA, carte, true, true);
	const effet = effetDe(carte);
	const effetIA = effetDe(carteIA);
	if (effetIA.alteration === "echo" || effet.alteration === "echo") q.options = appliquerEcho(q.options, q.bonne);
	const duree = (effetIA.alteration === "temporel" ? 12 : 20) + (etat.bonus ?? 0);
	const dureeIA = effet.alteration === "temporel" ? 12 : 20;
	const brute = reponseAdversaire({
		...adversaire,
		precision: adversaire.precision - (effet.alteration ? .15 : 0)
	}, q);
	const hesitee = {
		...brute,
		temps: brute.temps + (etat.hesitation ?? 0)
	};
	const reponseIA = hesitee.temps > dureeIA ? {
		choix: -1,
		temps: dureeIA
	} : hesitee;
	if (etat.retrait && manche === 1 && q.options.length > 3) {
		const candidates = q.options.map((_, i) => i).filter((i) => i !== q.bonne && i !== reponseIA.choix);
		const retiree = candidates[Math.floor(Math.random() * candidates.length)];
		q.options = q.options.filter((_, i) => i !== retiree);
		if (q.bonne > retiree) q.bonne--;
		if (reponseIA.choix > retiree) reponseIA.choix--;
	}
	await ecrire(env, idDuel, idJoueur, version, {
		...etat,
		manche,
		phase: "question",
		carte: idCarte,
		carteIA: idIA,
		question: {
			sujet: q.sujet.id,
			intitule: q.intitule,
			document: q.document,
			image: q.image,
			options: q.options,
			bonne: q.bonne,
			difficulte: q.difficulte
		},
		debut: maintenant,
		reponseIA,
		duree
	});
	return {
		manche,
		surMaCarte,
		question: {
			intitule: q.intitule,
			document: q.document,
			image: q.image,
			options: q.options
		},
		duree,
		alteration: effetIA.alteration ? {
			nom: effetIA.nom,
			icone: effetIA.icone,
			texte: effetIA.texte,
			alteration: effetIA.alteration
		} : null,
		tempsIA: reponseIA.temps
	};
}
async function repondre(env, idJoueur, corps, maintenant) {
	const idDuel = texte(corps.id);
	const { etat, version } = await lire(env, idDuel, idJoueur);
	if (etat.phase !== "question" || !etat.question || !etat.carte || !etat.carteIA || !etat.reponseIA || etat.debut === void 0) throw new Erreur(409, "Aucune question en cours");
	const q = etat.question;
	const ecoule = (maintenant - etat.debut) / 1e3;
	const choix = corps.choix;
	const choixRetenu = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= (etat.duree ?? 20) + 3 ? choix : null;
	const temps = Math.min(etat.duree ?? 20, ecoule);
	const b = await base(env, etat.langue);
	const carte = b.parId.get(etat.carte);
	const carteIA = b.parId.get(etat.carteIA);
	const ok = choixRetenu === q.bonne;
	const okIA = etat.reponseIA.choix === q.bonne;
	const tousDeux = ok && okIA;
	const effet = effetDe(carte);
	const effetIA = effetDe(carteIA);
	const infliges = ok ? Math.round(degats(carte, carteIA, temps, tousDeux && temps < etat.reponseIA.temps) * (effet.force ?? 1)) : 0;
	const recus = okIA ? Math.round(degats(carteIA, carte, etat.reponseIA.temps, tousDeux && etat.reponseIA.temps < temps) * (effetIA.force ?? 1)) : 0;
	const contamine = {
		joueur: etat.poison ?? 0,
		ia: etat.poisonIA ?? 0
	};
	const suivant = {
		...etat,
		phase: "resultat",
		pv: etat.pv - recus - contamine.joueur,
		pvIA: etat.pvIA - infliges - contamine.ia,
		poison: contamine.joueur + (okIA && effetIA.poison ? effetIA.poison : 0),
		poisonIA: contamine.ia + (ok && effet.poison ? effet.poison : 0),
		bonnes: etat.bonnes + (ok ? 1 : 0),
		main: etat.main.filter((id) => id !== etat.carte),
		mainIA: etat.mainIA.filter((id) => id !== etat.carteIA),
		debut: void 0
	};
	const resultat = {
		bonne: q.bonne,
		choix: choixRetenu,
		temps,
		reponseIA: etat.reponseIA,
		carteIA: etat.carteIA,
		degatsInfliges: infliges,
		degatsRecus: recus,
		contamination: contamine,
		effets: {
			joueur: effet,
			ia: effetIA
		},
		pv: suivant.pv,
		pvIA: suivant.pvIA,
		bonnes: suivant.bonnes,
		manche: suivant.manche
	};
	if (!terminee(suivant)) {
		await ecrire(env, idDuel, idJoueur, version, suivant);
		return {
			...resultat,
			fin: null
		};
	}
	const issue = suivant.pv > suivant.pvIA ? "victoire" : suivant.pv < suivant.pvIA ? "defaite" : "nul";
	const gains = await rpc(env, "duel_clore", {
		p_duel: idDuel,
		p_joueur: idJoueur,
		p_version: version,
		p_etat: suivant,
		p_issue: issue,
		p_bonnes: suivant.bonnes,
		p_questions: suivant.manche
	});
	return {
		...resultat,
		fin: {
			issue,
			...gains
		}
	};
}
function entetesCors(env, req) {
	const origine = req.headers.get("Origin") ?? "";
	return {
		"Access-Control-Allow-Origin": env.origines.includes(origine) ? origine : env.origines[0],
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		Vary: "Origin"
	};
}
async function traiter(req, env) {
	const cors = entetesCors(env, req);
	if (req.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: cors
	});
	const repondreJson = (statut, donnees) => new Response(JSON.stringify(donnees), {
		status: statut,
		headers: {
			...cors,
			"Content-Type": "application/json"
		}
	});
	try {
		if (req.method !== "POST") throw new Erreur(405, "Méthode non autorisée");
		if (!env.url || !env.cleService) throw new Erreur(500, "Configuration du serveur incomplète");
		const corps = await req.json().catch(() => null);
		if (!corps || typeof corps !== "object") throw new Erreur(400, "Requête invalide");
		if (corps.action === "push") return repondreJson(200, await traiterPush(env));
		const idJoueur = await joueur(env, req);
		const maintenant = (env.maintenant ?? Date.now)();
		switch (corps.action) {
			case "debuter": return repondreJson(200, await debuter(env, idJoueur, corps));
			case "jouer": return repondreJson(200, await jouer(env, idJoueur, corps, maintenant));
			case "repondre": return repondreJson(200, await repondre(env, idJoueur, corps, maintenant));
			default:
				if (typeof corps.action === "string" && ACTIONS_BRECHE.has(corps.action)) return repondreJson(200, await traiterBreche(env, idJoueur, corps.action, corps, maintenant));
				if (typeof corps.action === "string" && ACTIONS_RECO.has(corps.action)) return repondreJson(200, await traiterReco(env, idJoueur, corps.action, corps, maintenant));
				if (typeof corps.action === "string" && ACTIONS_EPREUVE.has(corps.action)) return repondreJson(200, await traiterEpreuve(env, idJoueur, corps.action, corps, maintenant));
				if (typeof corps.action === "string" && ACTIONS_JCJ.has(corps.action)) return repondreJson(200, await traiterJcj(env, idJoueur, corps.action, corps, maintenant));
				throw new Erreur(400, "Action inconnue");
		}
	} catch (e) {
		if (e instanceof Erreur) return repondreJson(e.statut, { message: e.message });
		console.error(e);
		return repondreJson(500, { message: "Erreur du serveur" });
	}
}
// serveur/edge.ts
/**
* Point d'entrée de la fonction Edge « duel » sur Supabase (Deno).
* `npm run duel` regroupe ce fichier et le code partagé de src/engine dans supabase/functions/duel/index.js.
*/
/** Clé de service : l'ancienne (JWT) si elle existe, sinon la nouvelle clé secrète par défaut. */
function cleService() {
	const ancienne = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (ancienne) return ancienne;
	const secretes = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
	return secretes.default ?? Object.values(secretes)[0] ?? "";
}
const site = Deno.env.get("SITE_JEU") ?? "https://scp-masters.vercel.app";
const env = {
	url: Deno.env.get("SUPABASE_URL") ?? "",
	cleService: cleService(),
	site,
	origines: [site, "http://localhost:5191"],
	vapid: Deno.env.get("VAPID_JWK")
};
Deno.serve((req) => traiter(req, env));
