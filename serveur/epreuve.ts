/**
 * L'Épreuve de la semaine (fonction Edge « duel ») : dix questions, les mêmes pour tous les agents, tirées d'une
 * graine qui ne dépend que de la semaine ; une seule tentative, chronométrée par le serveur. Le classement et les
 * récompenses du lundi sont en SQL (public.epreuve, prive.clore_epreuve).
 */
import type { Base } from '../src/data/catalogue'
import { DUREE_QUESTION } from '../src/engine/duel'
import { genererQuestion } from '../src/engine/quiz'
import type { Langue } from '../src/types'
import { Erreur, GRACE, base, rpc, type Environnement } from './commun'

export const ACTIONS_EPREUVE = new Set(['epreuve_debuter', 'epreuve_question', 'epreuve_repondre'])

export const QUESTIONS_EPREUVE = 10
/** Des anomalies célèbres aux dossiers oubliés : la rareté du sujet de chaque question */
const RARETES = [4, 4, 3, 3, 3, 2, 2, 2, 1, 1]
/** Points d'une bonne réponse, plus un bonus de vitesse */
export const POINTS = 100
export const BONUS_VITESSE = 50

interface QuestionEpreuve {
  sujet: string
  intitule: string
  document?: string
  options: string[]
  bonne: number
}

interface Reponse {
  choix: number | null
  temps: number
  points: number
}

export interface EtatEpreuve {
  semaine: string
  questions: QuestionEpreuve[]
  reponses: Reponse[]
  /** Horodatage serveur de l'envoi de la question en cours */
  debut?: number
}

// ---------- Tirage reproductible ----------

/** Générateur pseudo-aléatoire (mulberry32) amorcé par une chaîne */
function generateur(graine: string): () => number {
  let h = 1779033703 ^ graine.length
  for (let i = 0; i < graine.length; i++) {
    h = Math.imul(h ^ graine.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Les dix questions d'une semaine. Le générateur de questions tire avec Math.random : on le remplace le temps de ce
 * calcul synchrone, si bien que deux appels pour la même semaine donnent exactement les mêmes questions.
 */
export function questionsDeLaSemaine(b: Base, semaine: string): QuestionEpreuve[] {
  const original = Math.random
  Math.random = generateur(`epreuve:${semaine}`)
  try {
    const dejaVues = new Set<string>()
    return RARETES.map((ra) => {
      const candidates = (b.parType.get('s')?.[ra] ?? b.parRarete[ra]).filter((c) => !dejaVues.has(c.id))
      const sujet = candidates[Math.floor(Math.random() * candidates.length)]
      dejaVues.add(sujet.id)
      const autres = b.parRarete[ra]
      let autre = autres[Math.floor(Math.random() * autres.length)]
      if (autre.id === sujet.id) autre = autres[(autres.indexOf(autre) + 1) % autres.length]
      const q = genererQuestion(b, sujet, autre, true)
      return { sujet: sujet.id, intitule: q.intitule, document: q.document, options: q.options, bonne: q.bonne }
    })
  } finally {
    Math.random = original
  }
}

export const pointsDe = (juste: boolean, temps: number) => (juste ? POINTS + Math.round(BONUS_VITESSE * Math.max(0, 1 - temps / DUREE_QUESTION)) : 0)

const score = (e: EtatEpreuve) => e.reponses.reduce((s, r) => s + r.points, 0)
const bonnes = (e: EtatEpreuve) => e.reponses.filter((r) => r.points > 0).length

// ---------- Lecture et écriture ----------

interface Tentative {
  semaine: string
  langue: Langue
  etat: EtatEpreuve | null
  version: number
  termine: boolean
}

const lire = (env: Environnement, idJoueur: string) => rpc<Tentative>(env, 'epreuve_preparer', { p_joueur: idJoueur })

async function ecrire(env: Environnement, idJoueur: string, version: number, etat: EtatEpreuve) {
  const ok = await rpc<boolean>(env, 'epreuve_ecrire', {
    p_joueur: idJoueur,
    p_semaine: etat.semaine,
    p_version: version,
    p_etat: etat,
    p_score: score(etat),
    p_bonnes: bonnes(etat),
    p_termine: etat.reponses.length >= QUESTIONS_EPREUVE,
  })
  if (!ok) throw new Erreur(409, version === 0 ? 'Épreuve déjà commencée cette semaine' : 'L’épreuve a changé entre-temps : rechargez la page')
}

/** Ce que voit le joueur : jamais les bonnes réponses à venir */
function vue(e: EtatEpreuve) {
  return { index: e.reponses.length, total: QUESTIONS_EPREUVE, score: score(e), bonnes: bonnes(e), termine: e.reponses.length >= QUESTIONS_EPREUVE }
}

function questionVue(e: EtatEpreuve, maintenant: number) {
  const q = e.questions[e.reponses.length]
  return {
    ...vue(e),
    question: { intitule: q.intitule, document: q.document, options: q.options },
    duree: DUREE_QUESTION,
    // Déjà écoulé, si le joueur revient sur une question déjà affichée
    ecoule: e.debut === undefined ? 0 : (maintenant - e.debut) / 1000,
  }
}

// ---------- Actions ----------

async function debuter(env: Environnement, idJoueur: string) {
  const t = await lire(env, idJoueur)
  if (t.termine) throw new Erreur(409, 'Vous avez déjà passé l’Épreuve de cette semaine')
  if (t.etat) return vue(t.etat)
  const b = await base(env, t.langue)
  const etat: EtatEpreuve = { semaine: t.semaine, questions: questionsDeLaSemaine(b, t.semaine), reponses: [] }
  await ecrire(env, idJoueur, 0, etat)
  return vue(etat)
}

async function question(env: Environnement, idJoueur: string, maintenant: number) {
  const t = await lire(env, idJoueur)
  if (!t.etat) throw new Erreur(404, 'Commencez d’abord l’Épreuve')
  if (t.termine) throw new Erreur(409, 'Épreuve terminée')
  const etat = t.etat
  // Question déjà affichée : encore dans les temps, on la renvoie telle quelle (même chronomètre)
  if (etat.debut !== undefined && (maintenant - etat.debut) / 1000 <= DUREE_QUESTION + GRACE) return questionVue(etat, maintenant)
  let manquee = false
  if (etat.debut !== undefined) {
    // Partie entre-temps : la question est perdue
    etat.reponses.push({ choix: null, temps: DUREE_QUESTION, points: 0 })
    manquee = true
  }
  if (etat.reponses.length >= QUESTIONS_EPREUVE) {
    etat.debut = undefined
    await ecrire(env, idJoueur, t.version, etat)
    return { ...vue(etat), manquee }
  }
  etat.debut = maintenant
  await ecrire(env, idJoueur, t.version, etat)
  return { ...questionVue(etat, maintenant), manquee }
}

async function repondre(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const t = await lire(env, idJoueur)
  const etat = t.etat
  if (!etat || t.termine || etat.debut === undefined) throw new Erreur(409, 'Aucune question en cours')
  const q = etat.questions[etat.reponses.length]
  const ecoule = (maintenant - etat.debut) / 1000
  const choix = corps.choix
  const valide = typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= DUREE_QUESTION + GRACE
  const choixRetenu = valide ? (choix as number) : null
  const temps = Math.min(DUREE_QUESTION, ecoule)
  const points = pointsDe(choixRetenu === q.bonne, temps)
  etat.reponses.push({ choix: choixRetenu, temps, points })
  etat.debut = undefined
  await ecrire(env, idJoueur, t.version, etat)
  return { ...vue(etat), bonne: q.bonne, choix: choixRetenu, temps, points }
}

export async function traiterEpreuve(env: Environnement, idJoueur: string, action: string, corps: Record<string, unknown>, maintenant: number) {
  switch (action) {
    case 'epreuve_debuter':
      return debuter(env, idJoueur)
    case 'epreuve_question':
      return question(env, idJoueur, maintenant)
    default:
      return repondre(env, idJoueur, corps, maintenant)
  }
}
