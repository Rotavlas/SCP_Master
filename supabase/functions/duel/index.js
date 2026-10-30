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
function effetDe(c) {
	const signature = SIGNATURES[c.id];
	if (signature) return signature;
	const tags = new Set(c.t ?? []);
	return FAMILLES.find((f) => f.tags.some((t) => tags.has(t)))?.effet ?? SANS_EFFET;
}
// src/data/catalogue.ts
const RARETES = [
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
const CLASSES = {
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
	return carte.ce ?? (carte.c ? CLASSES[carte.c].nom : "");
}
/** Comment désigner une carte dans une phrase : « SCP-173 », « MTF Epsilon-11 », « Dr. Alto Clef »… */
function designation(carte) {
	if (carte.num) return carte.num;
	return carte.k === "p" ? carte.nm : `« ${carte.nm} »`;
}
var Base = class Base {
	cartes;
	parId = /* @__PURE__ */ new Map();
	parRarete = RARETES.map(() => []);
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
		for (const k of ORDRE_TYPES) this.parType.set(k, RARETES.map(() => []));
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
function construire(sujet, intitule, bonne, leurres, difficulte, document) {
	const uniques = [...new Set(leurres.filter((l) => l && l !== bonne))].slice(0, 3);
	if (uniques.length < 3) return null;
	const options = melanger([bonne, ...uniques]);
	return {
		sujet,
		intitule,
		document,
		options,
		bonne: options.indexOf(bonne),
		difficulte
	};
}
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
/** Une question sur l'une des deux cartes en jeu ; `cachee` indique que le joueur ne voit pas le sujet. */
function genererQuestion(base, sujet, autre, cachee) {
	const permis = GENERATEURS.filter((g) => cachee || !g.identification || !sujet.num);
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
function resoudre$2(joueur, ia, coupJoueur, coupIA) {
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
async function lire$3(env, id, joueur) {
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
async function ecrire$2(env, id, joueur, version, etat) {
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
async function debuter$2(env, idJoueur, corps) {
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
		initiative: null
	};
	await ecrire$2(env, prep.id, idJoueur, 0, etat);
	return {
		id: prep.id,
		...vuePublique$1(etat)
	};
}
async function jouer$2(env, idJoueur, corps, maintenant) {
	const id = texte(corps.id);
	const { etat, version } = await lire$3(env, id, idJoueur);
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
	const reponseIA = reponseAdversaire(adversaire, qIA);
	await ecrire$2(env, id, idJoueur, version, {
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
		duree: 20,
		tempsIA: reponseIA.temps
	};
}
async function repondre$3(env, idJoueur, corps, maintenant) {
	const id = texte(corps.id);
	const { etat, version } = await lire$3(env, id, idJoueur);
	if (etat.phase !== "question" || !etat.question || !etat.coup || !etat.coupIA || !etat.reponseIA || etat.debut === void 0) throw new Erreur(409, "Aucune question en cours");
	const q = etat.question;
	const ecoule = (maintenant - etat.debut) / 1e3;
	const choix = corps.choix;
	const choixRetenu = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= 23 ? choix : null;
	const temps = Math.min(20, ecoule);
	const juste = choixRetenu === q.bonne;
	const justeIA = etat.reponseIA.choix === etat.reponseIA.bonne;
	const b = await base(env, etat.langue);
	const carte = b.parId.get(etat.coup.carte);
	const carteIA = b.parId.get(etat.coupIA.carte);
	const r = resoudre$2(etat.joueur, etat.ia, {
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
		await ecrire$2(env, id, idJoueur, version, pret);
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
		case "breche_debuter": return debuter$2(env, idJoueur, corps);
		case "breche_jouer": return jouer$2(env, idJoueur, corps, maintenant);
		default: return repondre$3(env, idJoueur, corps, maintenant);
	}
}
const autre = (c) => c === "a" ? "b" : "a";
const COTES = ["a", "b"];
function etatInitial(prep, maintenant) {
	return {
		etat: {
			manche: 1,
			phase: "choix",
			echeance: maintenant + 2e4,
			maintenant,
			pv: {
				a: 100,
				b: 100
			},
			jouees: {
				a: [],
				b: []
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
			langue: prep.langue,
			mains: {
				a: prep.equipeA,
				b: prep.equipeB
			},
			premier: Math.random() < .5 ? "a" : "b",
			carte: {},
			reponses: {}
		}
	};
}
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
	const { etat, secret } = etatInitial(prep, maintenant);
	await rpc(env, "jcj_ecrire", {
		p_duel: prep.id,
		p_version: 0,
		p_etat: etat,
		p_secret: secret
	});
}
/** Ce que voit un joueur : l'état public, sa propre main restante, et ses gains si le duel est fini. */
function vue(lu, id) {
	const etat = lu.etat;
	const moi = lu.cote;
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
		main: lu.secret && etat.jouees ? lu.secret.mains[moi].filter((c) => !etat.jouees[moi].includes(c)) : [],
		maCarte: lu.secret?.carte[moi] ?? null,
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
		let change = appliquerDelais(etat, secret, b, maintenant);
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
			const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote, b) => choisir(etat, secret, cote, idCarte, b, maintenant));
			return {
				...vue(lu, idDuel),
				profil
			};
		}
		case "jcj_repondre": {
			const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote, b) => repondre$2(etat, secret, cote, corps.choix, b, maintenant));
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
	integrite: 100,
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
function preparerReconfinement(anomalie, defenseur, soutienDefenseur) {
	const effet = effetDe(anomalie);
	const s = soutienDefenseur && nature(soutienDefenseur) === "soutien" ? soutien(soutienDefenseur) : null;
	const neutralise = s === "protocole";
	const dissipe = neutralise || s === "personnel";
	let duree = 20;
	if (effet.alteration === "temporel" && !dissipe) duree = 12;
	if (defenseur.questionsCourtes > 0) duree = 8;
	if (s === "personnel") duree += 8;
	const retirees = Math.min(2, (s === "fim" ? soutienDefenseur.ra >= 3 ? 2 : 1 : 0) + (defenseur.questionsFaciles > 0 ? 2 : 0));
	const auto = defenseur.reconfinementsAuto > 0 || s === "fim" && aConfine(soutienDefenseur, anomalie) ? "reussite" : defenseur.echecsAuto > 0 ? "echec" : null;
	return {
		effet,
		alteree: !dissipe && !!effet.alteration,
		actif: !neutralise,
		duree,
		retirees,
		auto,
		attenuation: neutralise ? .5 : 1
	};
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
			camps[auteur].integrite = Math.min(100, camps[auteur].integrite + soin);
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
const termine = (tour, joueur, ia) => tour >= 5 || joueur.integrite <= 0 || ia.integrite <= 0;
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
		texte: "La main adverse est révélée, et vos deux prochaines questions n’ont plus que deux réponses."
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
			moi.integrite = Math.min(100, moi.integrite + 35);
			moi.poison = 0;
			break;
		case "veto":
			lui.integrite = Math.max(0, lui.integrite - 15);
			moi.reconfinementsAuto += 1;
			break;
		case "revelation":
			moi.questionsFaciles += 2;
			break;
		case "clignement":
			lui.questionsCourtes += 2;
			break;
		case "effacement":
			lui.echecsAuto += 1;
			break;
		default: moi.integrite = Math.min(100, moi.integrite + 20);
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
		mainIA: etat.revele ? etat.mainIA : void 0,
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
	const etat = {
		mode: "reco",
		niveau: adversaire.niveau,
		langue: prep.langue,
		equipe: prep.equipe,
		main: prep.equipe,
		mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
		tour: 1,
		joueur: campReco(),
		ia: campReco(),
		bonnes: 0,
		questions: 0,
		phase: "choix",
		revele: false
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
			reponseIA = {
				juste: r.choix === q.bonne && r.temps <= recoIA.duree,
				temps: Math.min(r.temps, recoIA.duree)
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
			const question = {
				intitule: q.intitule,
				document: q.document,
				options: q.options,
				bonne: q.bonne,
				retirees: aRetirer(q.options, q.bonne, reco.retirees),
				duree: reco.duree
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
					options: q.options,
					retirees: question.retirees,
					duree: reco.duree
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
		camps[x].integrite = Math.min(100, camps[x].integrite + v);
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
		if (reponse) remplir(camps.joueur, gainReponse(issueJoueur.reconfinee, issueJoueur.temps));
		for (const k of [
			"reconfinementsAuto",
			"questionsCourtes",
			"echecsAuto",
			"questionsFaciles"
		]) consommes.joueur[k] = true;
	}
	finDeTour(camps, consommes, evenements);
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
	const etat = {
		niveau: adversaire.niveau,
		langue: prep.langue,
		main: prep.equipe,
		mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
		manche: 1,
		pv: 100,
		pvIA: 100,
		bonnes: 0,
		phase: "choix"
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
	const q = surMaCarte ? genererQuestion(b, carte, carteIA, false) : genererQuestion(b, carteIA, carte, true);
	const effet = effetDe(carte);
	const effetIA = effetDe(carteIA);
	const duree = effetIA.alteration === "temporel" ? 12 : 20;
	const dureeIA = effet.alteration === "temporel" ? 12 : 20;
	const brute = reponseAdversaire({
		...adversaire,
		precision: adversaire.precision - (effet.alteration ? .15 : 0)
	}, q);
	const reponseIA = brute.temps > dureeIA ? {
		choix: -1,
		temps: dureeIA
	} : brute;
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
		const idJoueur = await joueur(env, req);
		const corps = await req.json().catch(() => null);
		if (!corps || typeof corps !== "object") throw new Erreur(400, "Requête invalide");
		const maintenant = (env.maintenant ?? Date.now)();
		switch (corps.action) {
			case "debuter": return repondreJson(200, await debuter(env, idJoueur, corps));
			case "jouer": return repondreJson(200, await jouer(env, idJoueur, corps, maintenant));
			case "repondre": return repondreJson(200, await repondre(env, idJoueur, corps, maintenant));
			default:
				if (typeof corps.action === "string" && ACTIONS_BRECHE.has(corps.action)) return repondreJson(200, await traiterBreche(env, idJoueur, corps.action, corps, maintenant));
				if (typeof corps.action === "string" && ACTIONS_RECO.has(corps.action)) return repondreJson(200, await traiterReco(env, idJoueur, corps.action, corps, maintenant));
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
	origines: [site, "http://localhost:5191"]
};
Deno.serve((req) => traiter(req, env));
