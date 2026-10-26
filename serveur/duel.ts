/**
 * Duels contre l'IA, arbitrés par le serveur (fonction Edge « duel »).
 * Le navigateur ne reçoit jamais la bonne réponse avant d'avoir répondu : c'est ici que se tirent le deck
 * de l'IA et les questions, que se chronomètrent les réponses, que l'IA répond et que se calculent les
 * dégâts et l'issue. Les règles sont celles de src/engine, partagées avec l'affichage.
 * L'état de la partie est enregistré dans prive.duels_ia par les fonctions SQL duel_* (clé de service).
 */
import { Base } from '../src/data/catalogue'
import { ADVERSAIRES, DUREE_QUESTION, INTEGRITE_MAX, MANCHES, deckAdversaire, degats, reponseAdversaire } from '../src/engine/duel'
import { genererQuestion } from '../src/engine/quiz'
import type { Catalogue, Langue, Traductions } from '../src/types'

export interface Environnement {
  /** URL du projet Supabase */
  url: string
  /** Clé de service : seule autorisée à appeler les fonctions duel_* */
  cleService: string
  /** Site du jeu, d'où viennent le catalogue des cartes et les traductions */
  site: string
  /** Origines autorisées à appeler la fonction depuis un navigateur */
  origines: string[]
  maintenant?: () => number
}

/** Marge pour le trajet réseau au-delà des 20 secondes d'une question */
const GRACE = 3

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
}

class Erreur extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message)
  }
}

// ---------- Catalogue, gardé en mémoire tant que l'instance vit ----------

let catalogue: Promise<Catalogue> | null = null
let traductions: Promise<Traductions> | null = null
const bases = new Map<Langue, Base>()

async function telecharger<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Erreur(503, 'Catalogue des cartes indisponible, réessayez dans un instant')
  return (await r.json()) as T
}

async function base(env: Environnement, langue: Langue): Promise<Base> {
  const connue = bases.get(langue)
  if (connue) return connue
  catalogue ??= telecharger<Catalogue>(`${env.site}/data/cards.json`).catch((e) => {
    catalogue = null
    throw e
  })
  let b = new Base(await catalogue)
  if (langue === 'vf') {
    traductions ??= telecharger<Traductions>(`${env.site}/data/cards.fr.json`).catch((e) => {
      traductions = null
      throw e
    })
    b = b.avecTraductions(await traductions)
  }
  bases.set(langue, b)
  return b
}

// ---------- Supabase : identité du joueur et fonctions SQL ----------

function entetesService(env: Environnement): Record<string, string> {
  // Ancienne clé de service (JWT) ou nouvelle clé secrète (sb_secret_…), qui ne passe que par apikey
  return env.cleService.startsWith('eyJ') ? { apikey: env.cleService, Authorization: `Bearer ${env.cleService}` } : { apikey: env.cleService }
}

async function joueur(env: Environnement, req: Request): Promise<string> {
  const jeton = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jeton) throw new Erreur(401, 'Connexion requise')
  const r = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.cleService, Authorization: `Bearer ${jeton}` } })
  if (!r.ok) throw new Erreur(401, 'Session expirée : reconnectez-vous.')
  const u = (await r.json()) as { id?: string }
  if (!u.id) throw new Erreur(401, 'Connexion requise')
  return u.id
}

async function rpc<T>(env: Environnement, fonction: string, params: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${env.url}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: { ...entetesService(env), 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const corps = await r.text()
  if (!r.ok) {
    const message = (() => {
      try {
        return (JSON.parse(corps) as { message?: string }).message
      } catch {
        return undefined
      }
    })()
    // Les refus des règles du jeu (accréditation, équipe…) remontent tels quels au joueur
    throw new Erreur(r.status >= 500 ? 500 : 409, message ?? 'Erreur du serveur')
  }
  return (corps ? JSON.parse(corps) : null) as T
}

async function lire(env: Environnement, idDuel: string, idJoueur: string): Promise<{ etat: Etat; version: number }> {
  const r = await rpc<{ etat: Etat | null; version: number } | null>(env, 'duel_lire', { p_duel: idDuel, p_joueur: idJoueur })
  if (!r?.etat) throw new Erreur(404, 'Duel introuvable ou déjà terminé')
  return { etat: r.etat, version: r.version }
}

async function ecrire(env: Environnement, idDuel: string, idJoueur: string, version: number, etat: Etat) {
  const ok = await rpc<boolean>(env, 'duel_ecrire', { p_duel: idDuel, p_joueur: idJoueur, p_version: version, p_etat: etat })
  if (!ok) throw new Erreur(409, 'Le duel a changé entre-temps : rechargez la page')
}

// ---------- Déroulement d'un duel ----------

const terminee = (e: Etat) => e.manche >= MANCHES || e.pv <= 0 || e.pvIA <= 0
const texte = (v: unknown) => (typeof v === 'string' ? v : '')

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
  const reponseIA = reponseAdversaire(adversaire, q)
  const suivant: Etat = {
    ...etat,
    manche,
    phase: 'question',
    carte: idCarte,
    carteIA: idIA,
    question: { sujet: q.sujet.id, intitule: q.intitule, document: q.document, options: q.options, bonne: q.bonne, difficulte: q.difficulte },
    debut: maintenant,
    reponseIA,
  }
  await ecrire(env, idDuel, idJoueur, version, suivant)
  return {
    manche,
    surMaCarte,
    question: { intitule: q.intitule, document: q.document, options: q.options },
    duree: DUREE_QUESTION,
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
  const valide = typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= DUREE_QUESTION + GRACE
  const choixRetenu = valide ? (choix as number) : null
  const temps = Math.min(DUREE_QUESTION, ecoule)

  const b = await base(env, etat.langue)
  const carte = b.parId.get(etat.carte)!
  const carteIA = b.parId.get(etat.carteIA)!
  const ok = choixRetenu === q.bonne
  const okIA = etat.reponseIA.choix === q.bonne
  const tousDeux = ok && okIA
  const infliges = ok ? degats(carte, carteIA, temps, tousDeux && temps < etat.reponseIA.temps) : 0
  const recus = okIA ? degats(carteIA, carte, etat.reponseIA.temps, tousDeux && etat.reponseIA.temps < temps) : 0
  const suivant: Etat = {
    ...etat,
    phase: 'resultat',
    pv: etat.pv - recus,
    pvIA: etat.pvIA - infliges,
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
        throw new Erreur(400, 'Action inconnue')
    }
  } catch (e) {
    if (e instanceof Erreur) return repondreJson(e.statut, { message: e.message })
    console.error(e)
    return repondreJson(500, { message: 'Erreur du serveur' })
  }
}
