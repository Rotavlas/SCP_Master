/**
 * Duels entre joueurs, arbitrés par le serveur (fonction Edge « duel », actions jcj_*).
 * Les deux joueurs choisissent une carte, reçoivent la même question au même moment et répondent ; le serveur
 * chronomètre, corrige et applique les dégâts. L'état public (public.duels_jcj) est diffusé en direct aux deux
 * joueurs ; la bonne réponse, les mains complètes et les cartes choisies restent dans prive.duels_jcj_secret.
 * Personne ne fait avancer le duel à la place du serveur : chaque appel (y compris jcj_etat) applique les délais
 * dépassés, et un duel abandonné par les deux joueurs est annulé au bout de 3 minutes (prive.nettoyer_jcj).
 */
import type { Base } from '../src/data/catalogue'
import { DUREE_QUESTION, INTEGRITE_MAX, MANCHES, degats } from '../src/engine/duel'
import { genererQuestion } from '../src/engine/quiz'
import type { Langue } from '../src/types'
import { Erreur, GRACE, base, rpc, texte, type Environnement } from './commun'

export type Cote = 'a' | 'b'
type ParCote<T> = Record<Cote, T>

/** Temps pour choisir sa carte ; après une manche, quelques secondes de plus pour voir le résultat */
export const DUREE_CHOIX = 20
export const PAUSE_RESULTAT = 4

export interface EtatPublic {
  manche: number
  phase: 'choix' | 'question' | 'fin'
  /** Limite de la phase en cours, en millisecondes (horloge du serveur) */
  echeance: number
  /** Heure du serveur à l'écriture, pour que les navigateurs recalent leur compte à rebours */
  maintenant: number
  pv: ParCote<number>
  jouees: ParCote<string[]>
  choisi: ParCote<boolean>
  repondu: ParCote<boolean>
  question?: { intitule: string; document?: string; options: string[]; surCarteDe: Cote }
  /** Résultat de la manche précédente, révélé à tous les deux */
  dernier?: {
    manche: number
    intitule: string
    options: string[]
    bonne: number
    choix: ParCote<number | null>
    temps: ParCote<number>
    /** Dégâts reçus par chaque côté */
    degats: ParCote<number>
    cartes: ParCote<string>
  }
  fin?: { issue: Cote | 'nul'; abandon?: Cote }
}

export interface EtatSecret {
  langue: Langue
  /** Équipes au début du duel, dans l'ordre */
  mains: ParCote<string[]>
  /** Côté dont la carte fait l'objet de la question de la 1re manche ; ensuite, chacun son tour */
  premier?: Cote
  carte: Partial<ParCote<string>>
  question?: { bonne: number }
  debut?: number
  reponses: Partial<ParCote<{ choix: number | null; temps: number }>>
}

interface Lu {
  statut: 'invitation' | 'preparation' | 'en_cours' | 'termine' | 'annule'
  classe: boolean
  joueurA: string
  joueurB: string
  pseudoA: string
  pseudoB: string
  eloA: number
  eloB: number
  etat: EtatPublic | Record<string, never>
  secret: EtatSecret | null
  version: number
  resultat: ParCote<{ credits: number; xp: number; elo: number }> | null
}

interface Preparation {
  id: string
  joueurA: string
  joueurB: string
  classe: boolean
  equipeA: string[]
  equipeB: string[]
  langue: Langue
}

const autre = (c: Cote): Cote => (c === 'a' ? 'b' : 'a')
const COTES: Cote[] = ['a', 'b']

// ---------- Règles, sans accès au réseau (testables telles quelles) ----------

export function etatInitial(prep: Preparation, maintenant: number): { etat: EtatPublic; secret: EtatSecret } {
  return {
    etat: {
      manche: 1,
      phase: 'choix',
      echeance: maintenant + DUREE_CHOIX * 1000,
      maintenant,
      pv: { a: INTEGRITE_MAX, b: INTEGRITE_MAX },
      jouees: { a: [], b: [] },
      choisi: { a: false, b: false },
      repondu: { a: false, b: false },
    },
    secret: {
      langue: prep.langue,
      mains: { a: prep.equipeA, b: prep.equipeB },
      premier: Math.random() < 0.5 ? 'a' : 'b',
      carte: {},
      reponses: {},
    },
  }
}

const restantes = (etat: EtatPublic, secret: EtatSecret, cote: Cote) => secret.mains[cote].filter((id) => !etat.jouees[cote].includes(id))

/** Côté dont la carte fait l'objet de la question : chacun son tour (3 manches contre 2 sur un duel complet). */
export function sujetDeLaManche(secret: EtatSecret, manche: number): Cote {
  // Duels commencés avant l'alternance : pas de premier enregistré
  const premier = secret.premier ?? 'a'
  return manche % 2 === 1 ? premier : autre(premier)
}

/** Les deux cartes sont choisies : même question pour les deux joueurs, sur l'une des deux cartes. */
function lancerQuestion(etat: EtatPublic, secret: EtatSecret, b: Base, maintenant: number) {
  const carte = { a: b.parId.get(secret.carte.a!)!, b: b.parId.get(secret.carte.b!)! }
  const surCarteDe = sujetDeLaManche(secret, etat.manche)
  // Les deux cartes restent cachées pendant la question : pas de question d'identification, sauf sur
  // une fiche sans désignation (son nom est caviardé)
  const q = genererQuestion(b, carte[surCarteDe], carte[autre(surCarteDe)], false)
  etat.phase = 'question'
  etat.question = { intitule: q.intitule, document: q.document, options: q.options, surCarteDe }
  etat.repondu = { a: false, b: false }
  etat.echeance = maintenant + DUREE_QUESTION * 1000
  secret.question = { bonne: q.bonne }
  secret.debut = maintenant
  secret.reponses = {}
}

/** Fin de manche : dégâts, cartes jouées, puis manche suivante ou fin du duel. */
function resoudre(etat: EtatPublic, secret: EtatSecret, b: Base, maintenant: number) {
  const q = etat.question!
  const bonne = secret.question!.bonne
  const rep = { a: secret.reponses.a!, b: secret.reponses.b! }
  const carte = { a: b.parId.get(secret.carte.a!)!, b: b.parId.get(secret.carte.b!)! }
  const ok = { a: rep.a.choix === bonne, b: rep.b.choix === bonne }
  const tousDeux = ok.a && ok.b
  // Dégâts infligés par chaque côté (le plus rapide frappe plus fort quand les deux ont juste)
  const inflige = {
    a: ok.a ? degats(carte.a, carte.b, rep.a.temps, tousDeux && rep.a.temps < rep.b.temps) : 0,
    b: ok.b ? degats(carte.b, carte.a, rep.b.temps, tousDeux && rep.b.temps < rep.a.temps) : 0,
  }
  etat.pv = { a: etat.pv.a - inflige.b, b: etat.pv.b - inflige.a }
  etat.jouees = { a: [...etat.jouees.a, carte.a.id], b: [...etat.jouees.b, carte.b.id] }
  etat.dernier = {
    manche: etat.manche,
    intitule: q.intitule,
    options: q.options,
    bonne,
    choix: { a: rep.a.choix, b: rep.b.choix },
    temps: { a: rep.a.temps, b: rep.b.temps },
    degats: { a: inflige.b, b: inflige.a },
    cartes: { a: carte.a.id, b: carte.b.id },
  }
  etat.question = undefined
  secret.question = undefined
  secret.debut = undefined
  secret.carte = {}
  secret.reponses = {}
  if (etat.manche >= MANCHES || etat.pv.a <= 0 || etat.pv.b <= 0) {
    etat.phase = 'fin'
    etat.fin = { issue: etat.pv.a > etat.pv.b ? 'a' : etat.pv.a < etat.pv.b ? 'b' : 'nul' }
    return
  }
  etat.manche++
  etat.phase = 'choix'
  etat.choisi = { a: false, b: false }
  etat.repondu = { a: false, b: false }
  etat.echeance = maintenant + (DUREE_CHOIX + PAUSE_RESULTAT) * 1000
}

export function choisir(etat: EtatPublic, secret: EtatSecret, cote: Cote, idCarte: string, b: Base, maintenant: number) {
  if (etat.phase !== 'choix') throw new Erreur(409, 'Ce n\'est pas le moment de choisir une carte')
  if (etat.choisi[cote]) throw new Erreur(409, 'Carte déjà choisie pour cette manche')
  if (!restantes(etat, secret, cote).includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main")
  secret.carte[cote] = idCarte
  etat.choisi[cote] = true
  if (etat.choisi.a && etat.choisi.b) lancerQuestion(etat, secret, b, maintenant)
}

export function repondre(etat: EtatPublic, secret: EtatSecret, cote: Cote, choix: unknown, b: Base, maintenant: number) {
  if (etat.phase !== 'question' || !etat.question || secret.debut === undefined) throw new Erreur(409, 'Aucune question en cours')
  if (etat.repondu[cote]) throw new Erreur(409, 'Vous avez déjà répondu')
  const ecoule = (maintenant - secret.debut) / 1000
  // Hors délai ou réponse mal formée : comme si le temps était écoulé
  const valide =
    typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < etat.question.options.length && ecoule <= DUREE_QUESTION + GRACE
  secret.reponses[cote] = { choix: valide ? (choix as number) : null, temps: Math.min(DUREE_QUESTION, ecoule) }
  etat.repondu[cote] = true
  if (etat.repondu.a && etat.repondu.b) resoudre(etat, secret, b, maintenant)
}

/** Applique les délais dépassés : carte jouée d'office, question sans réponse. Renvoie true si l'état a changé. */
export function appliquerDelais(etat: EtatPublic, secret: EtatSecret, b: Base, maintenant: number): boolean {
  if (etat.phase === 'choix' && maintenant > etat.echeance) {
    for (const c of COTES) {
      if (!etat.choisi[c]) {
        secret.carte[c] = restantes(etat, secret, c)[0]
        etat.choisi[c] = true
      }
    }
    lancerQuestion(etat, secret, b, maintenant)
    return true
  }
  if (etat.phase === 'question' && maintenant > etat.echeance + GRACE * 1000) {
    for (const c of COTES) {
      if (!etat.repondu[c]) {
        secret.reponses[c] = { choix: null, temps: DUREE_QUESTION }
        etat.repondu[c] = true
      }
    }
    resoudre(etat, secret, b, maintenant)
    return true
  }
  return false
}

// ---------- Lecture et écriture, avec relecture si l'autre joueur a écrit entre-temps ----------

async function lire(env: Environnement, idDuel: string, idJoueur: string): Promise<Lu & { cote: Cote }> {
  const lu = await rpc<Lu | null>(env, 'jcj_lire', { p_duel: idDuel, p_joueur: idJoueur })
  if (!lu) throw new Erreur(404, 'Duel introuvable')
  return { ...lu, cote: lu.joueurA === idJoueur ? 'a' : 'b' }
}

async function initialiser(env: Environnement, prep: Preparation, maintenant: number) {
  const b = await base(env, prep.langue)
  if ([...prep.equipeA, ...prep.equipeB].some((id) => !b.parId.has(id))) throw new Erreur(409, 'Nouvelles fiches disponibles : rechargez la page')
  const { etat, secret } = etatInitial(prep, maintenant)
  if (!(await rpc<boolean>(env, 'jcj_ecrire', { p_duel: prep.id, p_version: 0, p_etat: etat, p_secret: secret }))) {
    throw new Erreur(409, 'Le duel a changé entre-temps : réessayez')
  }
}

/** Ce que voit un joueur : l'état public, sa propre main restante, et ses gains si le duel est fini. */
function vue(lu: Lu & { cote: Cote }, id: string) {
  const etat = lu.etat as EtatPublic
  const moi = lu.cote
  return {
    id,
    cote: moi,
    classe: lu.classe,
    statut: lu.statut,
    moi: { pseudo: moi === 'a' ? lu.pseudoA : lu.pseudoB, elo: moi === 'a' ? lu.eloA : lu.eloB },
    adversaire: { pseudo: moi === 'a' ? lu.pseudoB : lu.pseudoA, elo: moi === 'a' ? lu.eloB : lu.eloA },
    etat,
    main: lu.secret && etat.jouees ? lu.secret.mains[moi].filter((c) => !etat.jouees[moi].includes(c)) : [],
    maCarte: lu.secret?.carte[moi] ?? null,
    gains: lu.resultat?.[moi] ?? null,
  }
}

type Modification = (etat: EtatPublic, secret: EtatSecret, cote: Cote, b: Base) => boolean | void

/**
 * Lit le duel, applique les délais dépassés puis la modification demandée, et écrit. Si l'autre joueur a écrit
 * entre-temps (version changée), on relit et on recommence. Un duel qui se termine est clos ici : Elo et gains.
 */
async function modifier(env: Environnement, idDuel: string, idJoueur: string, maintenant: number, action?: Modification) {
  for (let essai = 0; essai < 4; essai++) {
    const lu = await lire(env, idDuel, idJoueur)
    if (lu.statut !== 'en_cours' || !lu.secret) return { lu, profil: null }
    const etat = structuredClone(lu.etat as EtatPublic)
    const secret = structuredClone(lu.secret)
    const b = await base(env, secret.langue)
    let change = appliquerDelais(etat, secret, b, maintenant)
    if (action && etat.phase !== 'fin') change = action(etat, secret, lu.cote, b) !== false || change
    if (!change) return { lu, profil: null }
    etat.maintenant = maintenant
    if (etat.phase === 'fin') {
      try {
        const gains = await rpc<ParCote<{ profil: unknown }>>(env, 'jcj_clore', {
          p_duel: idDuel,
          p_version: lu.version,
          p_etat: etat,
          p_issue: etat.fin!.issue,
        })
        return { lu: await lire(env, idDuel, idJoueur), profil: gains[lu.cote].profil }
      } catch (e) {
        if (essai < 3 && e instanceof Erreur && /déjà terminé/.test(e.message)) continue
        throw e
      }
    }
    if (await rpc<boolean>(env, 'jcj_ecrire', { p_duel: idDuel, p_version: lu.version, p_etat: etat, p_secret: secret })) {
      return { lu: { ...lu, etat, secret, version: lu.version + 1 }, profil: null }
    }
  }
  throw new Erreur(409, 'Le duel a changé entre-temps : réessayez')
}

// ---------- Actions ----------

export const ACTIONS_JCJ = new Set(['jcj_file', 'jcj_quitter', 'jcj_defier', 'jcj_repondre_defi', 'jcj_etat', 'jcj_jouer', 'jcj_repondre', 'jcj_abandonner'])

async function etatDuel(env: Environnement, idDuel: string, idJoueur: string, maintenant: number) {
  let lu = await lire(env, idDuel, idJoueur)
  // Duel resté en préparation (initialisation interrompue) : on le reprend
  if (lu.statut === 'preparation' && lu.version === 0) {
    await initialiser(env, await rpc<Preparation>(env, 'jcj_preparer', { p_duel: idDuel, p_joueur: idJoueur }), maintenant)
    lu = await lire(env, idDuel, idJoueur)
  }
  const { lu: apres, profil } = await modifier(env, idDuel, idJoueur, maintenant)
  return { ...vue(apres, idDuel), profil }
}

export async function traiterJcj(env: Environnement, idJoueur: string, action: string, corps: Record<string, unknown>, maintenant: number) {
  const idDuel = texte(corps.id)
  switch (action) {
    case 'jcj_file': {
      const r = await rpc<{ attente?: boolean; enFile?: number; enCours?: string; preparer?: Preparation }>(env, 'jcj_entrer_file', { p_joueur: idJoueur })
      if (r.preparer) {
        await initialiser(env, r.preparer, maintenant)
        return { duel: await etatDuel(env, r.preparer.id, idJoueur, maintenant) }
      }
      if (r.enCours) return { duel: await etatDuel(env, r.enCours, idJoueur, maintenant) }
      return { attente: true, enFile: r.enFile ?? 1 }
    }
    case 'jcj_quitter':
      await rpc(env, 'jcj_quitter_file', { p_joueur: idJoueur })
      return { ok: true }
    case 'jcj_defier':
      return rpc<{ id: string }>(env, 'jcj_defier', { p_joueur: idJoueur, p_pseudo: texte(corps.pseudo) })
    case 'jcj_repondre_defi': {
      const r = await rpc<{ refuse?: boolean; preparer?: Preparation }>(env, 'jcj_repondre_defi', {
        p_joueur: idJoueur,
        p_duel: idDuel,
        p_accepter: corps.accepter === true,
      })
      if (!r.preparer) return { refuse: true }
      await initialiser(env, r.preparer, maintenant)
      return { duel: await etatDuel(env, idDuel, idJoueur, maintenant) }
    }
    case 'jcj_etat':
      return etatDuel(env, idDuel, idJoueur, maintenant)
    case 'jcj_jouer': {
      const idCarte = texte(corps.carte)
      const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote, b) => choisir(etat, secret, cote, idCarte, b, maintenant))
      return { ...vue(lu, idDuel), profil }
    }
    case 'jcj_repondre': {
      const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, secret, cote, b) => repondre(etat, secret, cote, corps.choix, b, maintenant))
      return { ...vue(lu, idDuel), profil }
    }
    case 'jcj_abandonner': {
      const { lu, profil } = await modifier(env, idDuel, idJoueur, maintenant, (etat, _secret, cote) => {
        etat.phase = 'fin'
        etat.fin = { issue: autre(cote), abandon: cote }
      })
      return { ...vue(lu, idDuel), profil }
    }
  }
  throw new Erreur(400, 'Action inconnue')
}
