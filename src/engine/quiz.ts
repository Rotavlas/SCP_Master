import { TYPES, designation, nomClasse, type Base } from '../data/catalogue'
import type { Carte, Rarete } from '../types'

export interface Question {
  /** Carte sur laquelle porte la question */
  sujet: Carte
  intitule: string
  /** Extrait de dossier affiché sous la question */
  document?: string
  options: string[]
  bonne: number
  /** 0 facile → 2 difficile, module la précision de l'adversaire */
  difficulte: number
}

const EXPURGE = '████'
const CLASSES_STANDARD = ['Safe', 'Euclid', 'Keter', 'Thaumiel', 'Apollyon', 'Neutralized']
const SURNOM_INCONNU = /^\[DONNÉES EXPURGÉES\]$|^\[ACCESS DENIED\]$|^\[unknown\]$/i
const RARETES_TEXTE = ['Commune', 'Peu commune', 'Rare', 'Épique', 'Légendaire', 'Mythique']
const TAGS_GENERIQUES = new Set(['tale', 'goi-format', 'hub'])

function melanger<T>(liste: T[]): T[] {
  const copie = [...liste]
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copie[i], copie[j]] = [copie[j], copie[i]]
  }
  return copie
}

function choisir<T>(liste: T[]): T {
  return liste[Math.floor(Math.random() * liste.length)]
}

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const majuscule = (texte: string) => texte[0].toUpperCase() + texte.slice(1)

/** Caviarde la désignation (et les sous-numéros SCP-173-1…) et le nom de la fiche dans un extrait. */
function caviarder(texte: string, carte: Carte): string {
  let resultat = texte
  if (carte.num) {
    const numero = echapper(carte.num).replace(/\\-|-/g, '[-‑ ]?')
    const prefixe = carte.num.split(/[- ]/)[0]
    resultat = resultat.replace(new RegExp(`${numero}(?!\\d)(-[A-Z0-9]+)*`, 'gi'), `${prefixe}-${EXPURGE}`)
  }
  if (!SURNOM_INCONNU.test(carte.nm) && carte.nm.length > 3) {
    const nom = carte.nm.replace(/^(The |Dr\.? |Agent |Director )/i, '').replace(/\s*\(.*\)$/, '')
    if (nom.length > 3) resultat = resultat.replace(new RegExp(echapper(nom), 'gi'), '█████')
  }
  return resultat
}

function construire(sujet: Carte, intitule: string, bonne: string, leurres: string[], difficulte: number, document?: string): Question | null {
  const uniques = [...new Set(leurres.filter((l) => l && l !== bonne))].slice(0, 3)
  if (uniques.length < 3) return null
  const options = melanger([bonne, ...uniques])
  return { sujet, intitule, document, options, bonne: options.indexOf(bonne), difficulte }
}

/** Fiches du même type et de rareté proche : des leurres plausibles. */
function voisines(base: Base, carte: Carte, nombre: number, exclure: Carte[] = [], filtre?: (c: Carte) => boolean): Carte[] {
  const parRarete = base.parType.get(carte.k)!
  const choisies: Carte[] = []
  const ids = new Set([carte.id, ...exclure.map((c) => c.id)])
  for (let essai = 0; choisies.length < nombre && essai < 300; essai++) {
    const rarete = Math.min(5, carte.ra + (Math.random() < 0.5 ? 0 : 1))
    const pool = parRarete[rarete].length > 4 ? parRarete[rarete] : parRarete.flat()
    const c = choisir(pool)
    if (!ids.has(c.id) && !SURNOM_INCONNU.test(c.nm) && (!filtre || filtre(c))) {
      ids.add(c.id)
      choisies.push(c)
    }
  }
  return choisies
}

const etiquette = (c: Carte) => (SURNOM_INCONNU.test(c.nm) ? (c.num ?? c.nm) : c.num && c.num !== c.nm ? `${c.num} — ${c.nm}` : c.nm)
const aSurnom = (c: Carte) => !!c.num && c.num !== c.nm && !SURNOM_INCONNU.test(c.nm)
/** En VF, une réponse traduite parmi des leurres anglais se repère trop facilement : même langue partout. */
const memeLangue = (s: Carte) => (c: Carte) => !!c.vf === !!s.vf

type Generateur = (base: Base, sujet: Carte, autre: Carte) => Question | null

/**
 * `identification` : la bonne réponse désigne la carte elle-même (numéro, document caviardé).
 * Ces questions portent sur la carte adverse, cachée pendant la question, ou sur une fiche sans désignation.
 */
const GENERATEURS: { poids: number; identification?: boolean; f: Generateur }[] = [
  {
    poids: 3,
    f: (_b, s) => {
      if (s.k !== 's') return null
      const bonne = nomClasse(s)
      return construire(s, `Quelle est la classe de confinement de ${s.num} ?`, bonne, melanger(CLASSES_STANDARD.filter((c) => c !== bonne)), 0)
    },
  },
  {
    poids: 3,
    f: (b, s) => {
      if (!aSurnom(s)) return null
      const leurres = voisines(b, s, 3, [], (c) => aSurnom(c) && memeLangue(s)(c)).map((c) => c.nm)
      return construire(s, `Quel est le surnom de ${s.num} ?`, s.nm, leurres, 1)
    },
  },
  {
    poids: 2,
    identification: true,
    f: (b, s) => {
      if (!aSurnom(s)) return null
      const leurres = voisines(b, s, 3, [], (c) => aSurnom(c) && memeLangue(s)(c)).map((c) => c.num ?? '')
      return construire(s, `${majuscule(TYPES[s.k].article)} porte le surnom « ${s.nm} » ?`, s.num!, leurres, 1)
    },
  },
  {
    poids: 4,
    identification: true,
    f: (b, s, autre) => {
      if (!s.x || s.x.length < 60) return null
      const leurres = voisines(b, s, 3, [autre], memeLangue(s)).map(etiquette)
      const intitule =
        s.k === 'p'
          ? 'Qui ce dossier décrit-il ?'
          : s.k === 'c' || s.k === 'd'
            ? `De ${TYPES[s.k].article} cet extrait est-il tiré ?`
            : `${majuscule(TYPES[s.k].article)} ce document décrit-il ?`
      return construire(s, intitule, etiquette(s), leurres, 1, caviarder(s.x, s))
    },
  },
  {
    poids: 2,
    identification: true,
    f: (b, s, autre) => {
      if (!s.q || s.q.length < 60) return null
      const leurres = voisines(b, s, 3, [autre], memeLangue(s)).map(etiquette)
      return construire(s, 'Ces procédures de confinement concernent…', etiquette(s), leurres, 2, caviarder(s.q, s))
    },
  },
  {
    poids: 2,
    f: (b, s) => {
      const valide = (t: string) => !/^\d+$/.test(t) && t.length > 3 && !TAGS_GENERIQUES.has(t)
      const tags = (s.t ?? []).filter(valide)
      if (!tags.length) return null
      const propres = new Set(s.t)
      const leurres: string[] = []
      for (let essai = 0; leurres.length < 3 && essai < 100; essai++) {
        const t = choisir(choisir(b.parType.get(s.k)!.flat()).t ?? [])
        if (t && valide(t) && !propres.has(t) && !leurres.includes(t)) leurres.push(t)
      }
      return construire(s, `Lequel de ces tags du wiki est associé à ${designation(s)} ?`, choisir(tags), leurres, 1)
    },
  },
  {
    poids: 2,
    f: (b, s) => {
      // Fonction d'un membre du personnel, genre d'un conte, groupe à l'origine d'un document
      if (!s.cat || !['p', 'c', 'd'].includes(s.k)) return null
      const categories = [
        ...new Set(
          b.parType
            .get(s.k)!
            .flat()
            .map((c) => c.cat)
            .filter((c): c is string => !!c && c !== s.cat),
        ),
      ]
      const intitule =
        s.k === 'p'
          ? `Quelle est la fonction de ${s.nm} ?`
          : s.k === 'c'
            ? `Quel est le genre du conte ${designation(s)} ?`
            : `Quel Groupe d'intérêt est à l'origine de ${designation(s)} ?`
      return construire(s, intitule, s.cat, melanger(categories), 1)
    },
  },
  {
    poids: 3,
    f: (b, s) => {
      if (!s.lie?.length) return null
      const lie = s.lie
      const leurres = voisines(b, b.auHasard(Math.min(s.ra, 4) as Rarete, ['s']), 6, [], (c) => !lie.includes(c.num ?? '')).map((c) => c.num ?? '')
      const intitule =
        s.k === 'f'
          ? `Au confinement de quelle anomalie l'équipe ${s.num} a-t-elle participé ?`
          : s.k === 'e'
            ? `Quel dossier implique ${designation(s)} ?`
            : s.k === 'l'
              ? `Quelle anomalie est confinée au ${s.num} ?`
              : `À quelle anomalie ${designation(s)} est-il lié ?`
      return construire(s, intitule, choisir(lie), leurres, 2)
    },
  },
  {
    poids: 1,
    f: (_b, s) => {
      if (!s.y) return null
      const y = s.y
      const annees = melanger([-3, -2, -1, 1, 2, 3].map((d) => y + d).filter((a) => a >= 2008 && a <= new Date().getFullYear()))
      return construire(s, `En quelle année ${designation(s)} a-t-il été publié sur le wiki ?`, String(y), annees.map(String), 2)
    },
  },
  {
    poids: 1,
    f: (b, s) => {
      if (!s.a) return null
      const leurres = voisines(b, s, 6)
        .map((c) => c.a ?? '')
        .filter((a) => a && a !== s.a)
      return construire(s, `Qui a écrit ${designation(s)} ?`, s.a, leurres, 2)
    },
  },
]

/** Une question sur l'une des deux cartes en jeu ; `cachee` indique que le joueur ne voit pas le sujet. */
export function genererQuestion(base: Base, sujet: Carte, autre: Carte, cachee: boolean): Question {
  // Sur sa propre carte, une fiche sans désignation (conte, personnel, GdI…) a son nom caviardé pendant le duel :
  // la reconnaître à son extrait reste une vraie question, sinon il ne resterait que la rareté, visible sur la carte
  const permis = GENERATEURS.filter((g) => cachee || !g.identification || !sujet.num)
  const total = permis.reduce((s, g) => s + g.poids, 0)
  for (let essai = 0; essai < 30; essai++) {
    let x = Math.random() * total
    const g = permis.find((g) => (x -= g.poids) < 0) ?? permis[0]
    const q = g.f(base, sujet, autre)
    if (q) return q
  }
  for (const g of permis) {
    const q = g.f(base, sujet, autre)
    if (q) return q
  }
  // Fiche trop pauvre pour un vrai quiz : sa rareté reste une question honnête
  return construire(sujet, `Quelle est la rareté de ${designation(sujet)} ?`, RARETES_TEXTE[sujet.ra], RARETES_TEXTE, 0)!
}

/** Début d'un extrait de procédures, coupé proprement, sa désignation caviardée */
function extraitProcedures(c: Carte, longueur = 150): string {
  const t = caviarder(c.q ?? '', c)
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= longueur) return t
  const coupe = t.slice(0, longueur)
  return `${coupe.slice(0, Math.max(coupe.lastIndexOf(' '), longueur - 20))}…`
}

/**
 * La question pour reconfiner une anomalie qui s'échappe (Reconfinement) : la carte est visible, donc pas de
 * question qui la nomme. Une fois sur deux, quand elle a des procédures, reconnaître les siennes parmi d'autres.
 */
export function questionReconfinement(base: Base, anomalie: Carte): Question {
  if (anomalie.q && anomalie.q.length >= 80 && Math.random() < 0.5) {
    const leurres = voisines(base, anomalie, 6, [], (c) => !!c.q && c.q.length >= 80 && memeLangue(anomalie)(c)).map((c) => extraitProcedures(c))
    const q = construire(anomalie, `Quelles procédures reconfinent ${designation(anomalie)} ?`, extraitProcedures(anomalie), leurres, 2)
    if (q) return q
  }
  return genererQuestion(base, anomalie, anomalie, false)
}
