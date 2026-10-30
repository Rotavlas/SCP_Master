/**
 * Duels contre l'IA, arbitrés par le serveur (fonction Edge « duel ») ; les duels entre joueurs passent par
 * la même fonction (serveur/jcj.ts).
 * Le navigateur ne reçoit jamais la bonne réponse avant d'avoir répondu : c'est ici que se tirent le deck
 * de l'IA et les questions, que se chronomètrent les réponses, que l'IA répond et que se calculent les
 * dégâts et l'issue. Les règles sont celles de src/engine, partagées avec l'affichage.
 * L'état de la partie est enregistré dans prive.duels_ia par les fonctions SQL duel_* (clé de service).
 */
import { ADVERSAIRES, DUREE_QUESTION, INTEGRITE_MAX, MANCHES, deckAdversaire, degats, reponseAdversaire } from '../src/engine/duel'
import { DUREE_TEMPORELLE, effetDe } from '../src/engine/effets'
import { genererQuestion } from '../src/engine/quiz'
import type { Langue } from '../src/types'
import { Erreur, GRACE, base, joueur, rpc, texte, type Environnement } from './commun'
import { ACTIONS_BRECHE, traiterBreche } from './breche'
import { ACTIONS_JCJ, traiterJcj } from './jcj'
import { ACTIONS_RECO, traiterReco } from './reconfinement'

export type { Environnement } from './commun'

interface QuestionServeur {
  sujet: string
  intitule: string
  document?: string
  options: string[]
  bonne: number
  difficulte: number
}

export interface Etat {
  niveau: number
  langue: Langue
  main: string[]
  mainIA: string[]
  manche: number
  pv: number
  pvIA: number
  bonnes: number
  phase: 'choix' | 'question' | 'resultat'
  carte?: string
  carteIA?: string
  question?: QuestionServeur
  /** Horodatage serveur de l'envoi de la question */
  debut?: number
  reponseIA?: { choix: number; temps: number }
  /** Durée de la question du joueur (une anomalie temporelle adverse la raccourcit) */
  duree?: number
  /** Contamination : dégâts subis à chaque manche par le joueur, par l'IA */
  poison?: number
  poisonIA?: number
}

async function lire(env: Environnement, idDuel: string, idJoueur: string): Promise<{ etat: Etat; version: number }> {
  const r = await rpc<{ etat: (Etat & { mode?: string }) | null; version: number } | null>(env, 'duel_lire', { p_duel: idDuel, p_joueur: idJoueur })
  // Une Brèche de confinement ne se joue qu'avec ses propres actions (serveur/breche.ts)
  if (!r?.etat || r.etat.mode) throw new Erreur(404, 'Duel introuvable ou déjà terminé')
  return { etat: r.etat, version: r.version }
}

async function ecrire(env: Environnement, idDuel: string, idJoueur: string, version: number, etat: Etat) {
  const ok = await rpc<boolean>(env, 'duel_ecrire', { p_duel: idDuel, p_joueur: idJoueur, p_version: version, p_etat: etat })
  if (!ok) throw new Erreur(409, 'Le duel a changé entre-temps : rechargez la page')
}

// ---------- Déroulement d'un duel ----------

const terminee = (e: Etat) => e.manche >= MANCHES || e.pv <= 0 || e.pvIA <= 0

async function debuter(env: Environnement, idJoueur: string, corps: Record<string, unknown>) {
  const adversaire = ADVERSAIRES.find((a) => a.niveau === corps.niveau)
  if (!adversaire) throw new Erreur(400, 'Adversaire inconnu')
  const prep = await rpc<{ id: string; equipe: string[]; langue: Langue }>(env, 'duel_preparer', { p_joueur: idJoueur, p_niveau: adversaire.niveau })
  const b = await base(env, prep.langue)
  if (prep.equipe.some((id) => !b.parId.has(id))) throw new Erreur(409, 'Nouvelles fiches disponibles : rechargez la page')
  const etat: Etat = {
    niveau: adversaire.niveau,
    langue: prep.langue,
    main: prep.equipe,
    mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
    manche: 1,
    pv: INTEGRITE_MAX,
    pvIA: INTEGRITE_MAX,
    bonnes: 0,
    phase: 'choix',
  }
  await ecrire(env, prep.id, idJoueur, 0, etat)
  return { id: prep.id, main: etat.main, cartesIA: etat.mainIA.length, manche: 1, pv: etat.pv, pvIA: etat.pvIA }
}

async function jouer(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const idDuel = texte(corps.id)
  const { etat, version } = await lire(env, idDuel, idJoueur)
  let manche = etat.manche
  if (etat.phase === 'resultat') {
    if (terminee(etat)) throw new Erreur(409, 'Ce duel est terminé')
    manche++
  } else if (etat.phase !== 'choix') throw new Erreur(409, 'Une question attend déjà votre réponse')
  const idCarte = texte(corps.carte)
  if (!etat.main.includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main")

  const b = await base(env, etat.langue)
  const adversaire = ADVERSAIRES.find((a) => a.niveau === etat.niveau)!
  const carte = b.parId.get(idCarte)!
  const idIA = etat.mainIA[Math.floor(Math.random() * etat.mainIA.length)]
  const carteIA = b.parId.get(idIA)!
  // La question porte sur l'une des deux cartes ; la carte adverse reste cachée jusqu'à la réponse
  const surMaCarte = Math.random() < 0.5
  const q = surMaCarte ? genererQuestion(b, carte, carteIA, false) : genererQuestion(b, carteIA, carte, true)
  // Duel éclair : chaque carte altère la question de l'autre camp (src/engine/effets.ts)
  const effet = effetDe(carte)
  const effetIA = effetDe(carteIA)
  const duree = effetIA.alteration === 'temporel' ? DUREE_TEMPORELLE : DUREE_QUESTION
  const dureeIA = effet.alteration === 'temporel' ? DUREE_TEMPORELLE : DUREE_QUESTION
  const brute = reponseAdversaire({ ...adversaire, precision: adversaire.precision - (effet.alteration ? 0.15 : 0) }, q)
  // Trop lente pour une question raccourcie : l'IA n'a pas répondu à temps
  const reponseIA = brute.temps > dureeIA ? { choix: -1, temps: dureeIA } : brute
  const suivant: Etat = {
    ...etat,
    manche,
    phase: 'question',
    carte: idCarte,
    carteIA: idIA,
    question: { sujet: q.sujet.id, intitule: q.intitule, document: q.document, options: q.options, bonne: q.bonne, difficulte: q.difficulte },
    debut: maintenant,
    reponseIA,
    duree,
  }
  await ecrire(env, idDuel, idJoueur, version, suivant)
  return {
    manche,
    surMaCarte,
    question: { intitule: q.intitule, document: q.document, options: q.options },
    duree,
    // L'effet de la carte adverse, encore cachée, se fait sentir sur la question
    alteration: effetIA.alteration ? { nom: effetIA.nom, icone: effetIA.icone, texte: effetIA.texte, alteration: effetIA.alteration } : null,
    // Quand l'IA « a répondu », pour l'afficher pendant la question ; jamais son choix
    tempsIA: reponseIA.temps,
  }
}

async function repondre(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const idDuel = texte(corps.id)
  const { etat, version } = await lire(env, idDuel, idJoueur)
  if (etat.phase !== 'question' || !etat.question || !etat.carte || !etat.carteIA || !etat.reponseIA || etat.debut === undefined) {
    throw new Erreur(409, 'Aucune question en cours')
  }
  const q = etat.question
  const ecoule = (maintenant - etat.debut) / 1000
  const choix = corps.choix
  // Hors délai ou réponse mal formée : comme si le temps était écoulé
  const valide =
    typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= (etat.duree ?? DUREE_QUESTION) + GRACE
  const choixRetenu = valide ? (choix as number) : null
  const temps = Math.min(etat.duree ?? DUREE_QUESTION, ecoule)

  const b = await base(env, etat.langue)
  const carte = b.parId.get(etat.carte)!
  const carteIA = b.parId.get(etat.carteIA)!
  const ok = choixRetenu === q.bonne
  const okIA = etat.reponseIA.choix === q.bonne
  const tousDeux = ok && okIA
  const effet = effetDe(carte)
  const effetIA = effetDe(carteIA)
  // Une anomalie hostile frappe plus fort ; une contagieuse ronge l'autre camp à chaque manche suivante
  const infliges = ok ? Math.round(degats(carte, carteIA, temps, tousDeux && temps < etat.reponseIA.temps) * (effet.force ?? 1)) : 0
  const recus = okIA ? Math.round(degats(carteIA, carte, etat.reponseIA.temps, tousDeux && etat.reponseIA.temps < temps) * (effetIA.force ?? 1)) : 0
  const contamine = { joueur: etat.poison ?? 0, ia: etat.poisonIA ?? 0 }
  const suivant: Etat = {
    ...etat,
    phase: 'resultat',
    pv: etat.pv - recus - contamine.joueur,
    pvIA: etat.pvIA - infliges - contamine.ia,
    poison: contamine.joueur + (okIA && effetIA.poison ? effetIA.poison : 0),
    poisonIA: contamine.ia + (ok && effet.poison ? effet.poison : 0),
    bonnes: etat.bonnes + (ok ? 1 : 0),
    main: etat.main.filter((id) => id !== etat.carte),
    mainIA: etat.mainIA.filter((id) => id !== etat.carteIA),
    debut: undefined,
  }
  const resultat = {
    bonne: q.bonne,
    choix: choixRetenu,
    temps,
    reponseIA: etat.reponseIA,
    carteIA: etat.carteIA,
    degatsInfliges: infliges,
    degatsRecus: recus,
    contamination: contamine,
    effets: { joueur: effet, ia: effetIA },
    pv: suivant.pv,
    pvIA: suivant.pvIA,
    bonnes: suivant.bonnes,
    manche: suivant.manche,
  }
  if (!terminee(suivant)) {
    await ecrire(env, idDuel, idJoueur, version, suivant)
    return { ...resultat, fin: null }
  }
  const issue = suivant.pv > suivant.pvIA ? 'victoire' : suivant.pv < suivant.pvIA ? 'defaite' : 'nul'
  const gains = await rpc<{ credits: number; xp: number; profil: unknown }>(env, 'duel_clore', {
    p_duel: idDuel,
    p_joueur: idJoueur,
    p_version: version,
    p_etat: suivant,
    p_issue: issue,
    p_bonnes: suivant.bonnes,
    p_questions: suivant.manche,
  })
  return { ...resultat, fin: { issue, ...gains } }
}

// ---------- Requête HTTP ----------

function entetesCors(env: Environnement, req: Request): Record<string, string> {
  const origine = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': env.origines.includes(origine) ? origine : env.origines[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export async function traiter(req: Request, env: Environnement): Promise<Response> {
  const cors = entetesCors(env, req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const repondreJson = (statut: number, donnees: unknown) =>
    new Response(JSON.stringify(donnees), { status: statut, headers: { ...cors, 'Content-Type': 'application/json' } })
  try {
    if (req.method !== 'POST') throw new Erreur(405, 'Méthode non autorisée')
    if (!env.url || !env.cleService) throw new Erreur(500, 'Configuration du serveur incomplète')
    const idJoueur = await joueur(env, req)
    const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!corps || typeof corps !== 'object') throw new Erreur(400, 'Requête invalide')
    const maintenant = (env.maintenant ?? Date.now)()
    switch (corps.action) {
      case 'debuter':
        return repondreJson(200, await debuter(env, idJoueur, corps))
      case 'jouer':
        return repondreJson(200, await jouer(env, idJoueur, corps, maintenant))
      case 'repondre':
        return repondreJson(200, await repondre(env, idJoueur, corps, maintenant))
      default:
        // Brèche de confinement contre l'IA : serveur/breche.ts
        if (typeof corps.action === 'string' && ACTIONS_BRECHE.has(corps.action)) {
          return repondreJson(200, await traiterBreche(env, idJoueur, corps.action, corps, maintenant))
        }
        // Reconfinement contre l'IA : serveur/reconfinement.ts
        if (typeof corps.action === 'string' && ACTIONS_RECO.has(corps.action)) {
          return repondreJson(200, await traiterReco(env, idJoueur, corps.action, corps, maintenant))
        }
        // Duels entre joueurs : serveur/jcj.ts
        if (typeof corps.action === 'string' && ACTIONS_JCJ.has(corps.action)) {
          return repondreJson(200, await traiterJcj(env, idJoueur, corps.action, corps, maintenant))
        }
        throw new Erreur(400, 'Action inconnue')
    }
  } catch (e) {
    if (e instanceof Erreur) return repondreJson(e.statut, { message: e.message })
    console.error(e)
    return repondreJson(500, { message: 'Erreur du serveur' })
  }
}
