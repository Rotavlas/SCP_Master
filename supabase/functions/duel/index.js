// Généré par outils/construire_duel.mjs : ne pas modifier à la main.
// src/data/catalogue.ts
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
	parRarete = [
		[],
		[],
		[],
		[],
		[]
	];
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
		for (const k of ORDRE_TYPES) this.parType.set(k, [
			[],
			[],
			[],
			[],
			[]
		]);
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
	"Légendaire"
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
function choisir(liste) {
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
		const rarete = Math.min(4, carte.ra + (Math.random() < .5 ? 0 : 1));
		const c = choisir(parRarete[rarete].length > 4 ? parRarete[rarete] : parRarete.flat());
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
				const t = choisir(choisir(b.parType.get(s.k).flat()).t ?? []);
				if (t && valide(t) && !propres.has(t) && !leurres.includes(t)) leurres.push(t);
			}
			return construire(s, `Lequel de ces tags du wiki est associé à ${designation(s)} ?`, choisir(tags), leurres, 1);
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
			if (s.k !== "f" || !s.lie?.length) return null;
			const lie = s.lie;
			const leurres = voisines(b, b.auHasard(s.ra, ["s"]), 6, [], (c) => !lie.includes(c.num ?? "")).map((c) => c.num ?? "");
			return construire(s, `Au confinement de quelle anomalie l'équipe ${s.num} a-t-elle participé ?`, choisir(lie), leurres, 2);
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
async function lire(env, idDuel, idJoueur) {
	const r = await rpc(env, "duel_lire", {
		p_duel: idDuel,
		p_joueur: idJoueur
	});
	if (!r?.etat) throw new Erreur(404, "Duel introuvable ou déjà terminé");
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
const texte = (v) => typeof v === "string" ? v : "";
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
	const reponseIA = reponseAdversaire(adversaire, q);
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
		reponseIA
	});
	return {
		manche,
		surMaCarte,
		question: {
			intitule: q.intitule,
			document: q.document,
			options: q.options
		},
		duree: 20,
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
	const choixRetenu = typeof choix === "number" && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= 23 ? choix : null;
	const temps = Math.min(20, ecoule);
	const b = await base(env, etat.langue);
	const carte = b.parId.get(etat.carte);
	const carteIA = b.parId.get(etat.carteIA);
	const ok = choixRetenu === q.bonne;
	const okIA = etat.reponseIA.choix === q.bonne;
	const tousDeux = ok && okIA;
	const infliges = ok ? degats(carte, carteIA, temps, tousDeux && temps < etat.reponseIA.temps) : 0;
	const recus = okIA ? degats(carteIA, carte, etat.reponseIA.temps, tousDeux && etat.reponseIA.temps < temps) : 0;
	const suivant = {
		...etat,
		phase: "resultat",
		pv: etat.pv - recus,
		pvIA: etat.pvIA - infliges,
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
			default: throw new Erreur(400, "Action inconnue");
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
