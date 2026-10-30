/**
 * Le Reconfinement contre l'IA, arbitré par le serveur (fonction Edge « duel », actions reco_*).
 * Les règles sont dans src/engine/reconfinement.ts et src/engine/effets.ts. Les deux cartes du tour sont
 * montrées dès qu'elles sont jouées (il faut voir l'anomalie pour la reconfiner) ; la bonne réponse reste ici.
 * L'état est enregistré dans prive.duels_ia, comme les autres confrontations.
 */
import type { Base } from '../src/data/catalogue'
import { ADVERSAIRES, deckAdversaire, reponseAdversaire } from '../src/engine/duel'
import {
  appliquerLiberation,
  campReco,
  choisirIAReco,
  finDeTour,
  gainReponse,
  issueReco,
  manifestationDe,
  manifester,
  MANIFESTATION_MAX,
  nature,
  preparerReconfinement,
  remplir,
  soutien,
  termine,
  INTEGRITE_SITE,
  URGENCE,
  type CampReco,
  type Evenement,
  type Reconfinement,
} from '../src/engine/reconfinement'
import { questionReconfinement } from '../src/engine/quiz'
import type { Carte, Langue } from '../src/types'
import { Erreur, GRACE, base, rpc, texte, type Environnement } from './commun'

export const ACTIONS_RECO = new Set(['reco_debuter', 'reco_jouer', 'reco_repondre', 'reco_manifester'])

type Cote = 'joueur' | 'ia'

export interface EtatReco {
  mode: 'reco'
  niveau: number
  langue: Langue
  equipe: string[]
  main: string[]
  mainIA: string[]
  tour: number
  joueur: CampReco
  ia: CampReco
  bonnes: number
  questions: number
  phase: 'choix' | 'question'
  /** La main de l'IA est révélée (Révélation de Siegel) */
  revele: boolean
  coup?: string
  coupIA?: string
  /** Le reconfinement que le joueur doit réussir, avec la bonne réponse */
  question?: { intitule: string; document?: string; options: string[]; bonne: number; retirees: number[]; duree: number }
  reco?: Reconfinement
  debut?: number
  /** Le reconfinement de l'IA face à l'anomalie du joueur, déjà joué */
  recoIA?: Reconfinement
  reponseIA?: { juste: boolean; temps: number }
}

async function lire(env: Environnement, id: string, joueur: string): Promise<{ etat: EtatReco; version: number }> {
  const r = await rpc<{ etat: EtatReco | null; version: number } | null>(env, 'duel_lire', { p_duel: id, p_joueur: joueur })
  if (!r?.etat || r.etat.mode !== 'reco') throw new Erreur(404, 'Confrontation introuvable ou déjà terminée')
  return { etat: r.etat, version: r.version }
}

async function ecrire(env: Environnement, id: string, joueur: string, version: number, etat: EtatReco) {
  const ok = await rpc<boolean>(env, 'duel_ecrire', { p_duel: id, p_joueur: joueur, p_version: version, p_etat: etat })
  if (!ok) throw new Erreur(409, 'La confrontation a changé entre-temps : rechargez la page')
}

const adversaireDe = (niveau: number) => ADVERSAIRES.find((a) => a.niveau === niveau)!

function vuePublique(etat: EtatReco, b: Base) {
  return {
    tour: etat.tour,
    main: etat.main,
    cartesIA: etat.mainIA.length,
    // La main de l'IA est sur la table : on joue en sachant ce qui peut sortir d'en face
    mainIA: etat.mainIA,
    joueur: etat.joueur,
    ia: etat.ia,
    bonnes: etat.bonnes,
    manifestation: manifestationDe(etat.equipe.map((id) => b.parId.get(id)!)),
  }
}

async function debuter(env: Environnement, idJoueur: string, corps: Record<string, unknown>) {
  const adversaire = ADVERSAIRES.find((a) => a.niveau === corps.niveau)
  if (!adversaire) throw new Erreur(400, 'Adversaire inconnu')
  const prep = await rpc<{ id: string; equipe: string[]; langue: Langue }>(env, 'duel_preparer', { p_joueur: idJoueur, p_niveau: adversaire.niveau })
  const b = await base(env, prep.langue)
  if (prep.equipe.some((id) => !b.parId.has(id))) throw new Erreur(409, 'Nouvelles fiches disponibles : rechargez la page')
  const etat: EtatReco = {
    mode: 'reco',
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
    phase: 'choix',
    revele: false,
  }
  await ecrire(env, prep.id, idJoueur, 0, etat)
  return { id: prep.id, ...vuePublique(etat, b) }
}

/** Retire `n` mauvaises réponses au hasard */
function aRetirer(options: string[], bonne: number, n: number): number[] {
  const mauvaises = options.map((_, i) => i).filter((i) => i !== bonne)
  const retirees: number[] = []
  while (retirees.length < n && mauvaises.length) retirees.push(mauvaises.splice(Math.floor(Math.random() * mauvaises.length), 1)[0])
  return retirees
}

async function jouer(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const id = texte(corps.id)
  const { etat, version } = await lire(env, id, idJoueur)
  if (etat.phase !== 'choix') throw new Erreur(409, 'Un reconfinement attend votre réponse')
  const idCarte = texte(corps.carte)
  if (!etat.main.includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main")
  const b = await base(env, etat.langue)
  const adversaire = adversaireDe(etat.niveau)
  const carte = b.parId.get(idCarte)!
  const carteIA = choisirIAReco(
    etat.mainIA.map((x) => b.parId.get(x)!),
    etat.ia,
    adversaire.precision,
  )

  // L'IA reconfine d'abord l'anomalie du joueur (simulé)
  let recoIA: Reconfinement | undefined
  let reponseIA: { juste: boolean; temps: number } | undefined
  if (nature(carte) === 'anomalie') {
    recoIA = preparerReconfinement(carte, etat.ia, carteIA)
    if (recoIA.auto) reponseIA = { juste: recoIA.auto === 'reussite', temps: 0 }
    else {
      const q = questionReconfinement(b, carte)
      const malus = (recoIA.alteree ? 0.15 : 0) - recoIA.retirees * 0.1
      const r = reponseAdversaire({ ...adversaire, precision: Math.max(0.15, adversaire.precision - malus) }, q)
      reponseIA = { juste: r.choix === q.bonne && r.temps <= recoIA.duree, temps: Math.min(r.temps, recoIA.duree) }
    }
  }

  const suivant: EtatReco = { ...etat, coup: idCarte, coupIA: carteIA.id, recoIA, reponseIA }
  const revelation = { carteIA: carteIA.id, tempsIA: reponseIA && !recoIA?.auto ? reponseIA.temps : undefined }

  // Puis le joueur, face à l'anomalie de l'IA
  if (nature(carteIA) === 'anomalie') {
    const reco = preparerReconfinement(carteIA, etat.joueur, carte)
    if (!reco.auto) {
      const q = questionReconfinement(b, carteIA)
      const question = {
        intitule: q.intitule,
        document: q.document,
        options: q.options,
        bonne: q.bonne,
        retirees: aRetirer(q.options, q.bonne, reco.retirees),
        duree: reco.duree,
      }
      await ecrire(env, id, idJoueur, version, { ...suivant, phase: 'question', question, reco, debut: maintenant })
      return {
        ...revelation,
        question: { intitule: q.intitule, document: q.document, options: q.options, retirees: question.retirees, duree: reco.duree },
        reco: { effet: reco.effet, alteree: reco.alteree, actif: reco.actif },
      }
    }
    // Reconfinement d'office (FIM qui connaît l'anomalie, Main droite rouge…) ou échec d'office (Effacement)
    const res = await resoudre(env, id, idJoueur, version, { ...suivant, reco }, b, { reconfinee: reco.auto === 'reussite', temps: 0 }, null)
    return { ...revelation, auto: reco.auto, resultat: res }
  }
  // L'IA a joué un soutien : rien à reconfiner, le tour se résout tout de suite
  const res = await resoudre(env, id, idJoueur, version, suivant, b, null, null)
  return { ...revelation, resultat: res }
}

async function repondre(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const id = texte(corps.id)
  const { etat, version } = await lire(env, id, idJoueur)
  if (etat.phase !== 'question' || !etat.question || !etat.reco || etat.debut === undefined) throw new Erreur(409, 'Aucun reconfinement en cours')
  const q = etat.question
  const ecoule = (maintenant - etat.debut) / 1000
  const choix = corps.choix
  const valide =
    typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && !q.retirees.includes(choix) && ecoule <= q.duree + GRACE
  const choixRetenu = valide ? (choix as number) : null
  const temps = Math.min(q.duree, ecoule)
  const juste = choixRetenu === q.bonne
  const b = await base(env, etat.langue)
  const res = await resoudre(
    env,
    id,
    idJoueur,
    version,
    etat,
    b,
    { reconfinee: juste, temps, regarde: corps.regarde === true },
    { choix: choixRetenu, bonne: q.bonne },
  )
  return res
}

/** Résout le tour : libérations, soutiens, jauges, contagion, Manifestation de l'IA ; clôt la partie à la fin */
async function resoudre(
  env: Environnement,
  id: string,
  idJoueur: string,
  version: number,
  etat: EtatReco,
  b: Base,
  issueJoueur: { reconfinee: boolean; temps: number; regarde?: boolean } | null,
  reponse: { choix: number | null; bonne: number } | null,
) {
  const carte = b.parId.get(etat.coup!)!
  const carteIA = b.parId.get(etat.coupIA!)!
  const camps: Record<Cote, CampReco> = { joueur: { ...etat.joueur }, ia: { ...etat.ia } }
  const mains: Record<Cote, string[]> = { joueur: etat.main.filter((x) => x !== carte.id), ia: etat.mainIA.filter((x) => x !== carteIA.id) }
  const evenements: Evenement[] = []
  const consommes: Record<Cote, Partial<Record<keyof CampReco, boolean>>> = { joueur: {}, ia: {} }

  // Les Sites renforcent leur camp
  for (const [x, c] of [
    ['joueur', carte],
    ['ia', carteIA],
  ] as [Cote, Carte][]) {
    if (nature(c) === 'soutien' && soutien(c) === 'site') {
      const v = Math.round(c.def * 0.4)
      camps[x].integrite = Math.min(INTEGRITE_SITE, camps[x].integrite + v)
      evenements.push({ camp: x, type: 'soin', valeur: v, texte: `${c.num ?? c.nm} renforce le Site : +${v}` })
    }
  }
  const poche = (x: Cote) => {
    if (mains[x].length) mains[x].splice(Math.floor(Math.random() * mains[x].length), 1)
  }
  // L'anomalie du joueur, face au reconfinement de l'IA
  if (etat.recoIA && etat.reponseIA) {
    const r = appliquerLiberation('joueur', camps, carte, etat.recoIA, { reconfinee: etat.reponseIA.juste, temps: etat.reponseIA.temps }, evenements)
    if (r.poche) poche('ia')
    // Reconfinée, l'anomalie retourne dans la main de son propriétaire
    if (etat.reponseIA.juste) mains.joueur.push(carte.id)
    if (!etat.recoIA.auto) remplir(camps.ia, gainReponse(etat.reponseIA.juste, etat.reponseIA.temps))
    for (const k of ['reconfinementsAuto', 'questionsCourtes', 'echecsAuto', 'questionsFaciles'] as const) consommes.ia[k] = true
  }
  // L'anomalie de l'IA, face au reconfinement du joueur
  if (etat.reco && issueJoueur) {
    const r = appliquerLiberation('ia', camps, carteIA, etat.reco, issueJoueur, evenements)
    if (r.poche) poche('joueur')
    if (issueJoueur.reconfinee) mains.ia.push(carteIA.id)
    if (reponse) remplir(camps.joueur, gainReponse(issueJoueur.reconfinee, issueJoueur.temps))
    for (const k of ['reconfinementsAuto', 'questionsCourtes', 'echecsAuto', 'questionsFaciles'] as const) consommes.joueur[k] = true
  }
  finDeTour(camps, consommes, evenements)
  // L'IA se manifeste dès que sa jauge est pleine (Protocole d'urgence)
  if (camps.ia.manifestation >= MANIFESTATION_MAX && !camps.ia.manifeste && camps.ia.integrite > 0) {
    evenements.push(...manifester(URGENCE, 'ia', camps, mains))
  }

  const suivant: EtatReco = {
    ...etat,
    phase: 'choix',
    tour: etat.tour + 1,
    joueur: camps.joueur,
    ia: camps.ia,
    main: mains.joueur,
    mainIA: mains.ia,
    bonnes: etat.bonnes + (reponse && issueJoueur?.reconfinee ? 1 : 0),
    questions: etat.questions + (reponse ? 1 : 0),
    coup: undefined,
    coupIA: undefined,
    question: undefined,
    reco: undefined,
    recoIA: undefined,
    reponseIA: undefined,
    debut: undefined,
  }
  const resultat = {
    choix: reponse?.choix ?? null,
    bonne: reponse?.bonne,
    temps: issueJoueur?.temps,
    reponseIA: etat.reponseIA,
    evenements,
  }
  // Plus de cartes d'un côté (dimension de poche, chaînes) : la partie s'arrête aussi
  if (!termine(etat.tour, camps.joueur, camps.ia) && mains.joueur.length && mains.ia.length) {
    await ecrire(env, id, idJoueur, version, suivant)
    return { ...resultat, ...vuePublique(suivant, b), fin: null }
  }
  const issue = issueReco(camps.joueur, camps.ia)
  const questions = Math.min(5, Math.max(1, suivant.questions))
  const gains = await rpc<{ credits: number; xp: number; profil: unknown }>(env, 'duel_clore', {
    p_duel: id,
    p_joueur: idJoueur,
    p_version: version,
    p_etat: suivant,
    p_issue: issue,
    p_bonnes: Math.min(questions, suivant.bonnes),
    p_questions: questions,
  })
  return { ...resultat, ...vuePublique(suivant, b), fin: { issue, ...gains } }
}

async function manifesterJoueur(env: Environnement, idJoueur: string, corps: Record<string, unknown>) {
  const id = texte(corps.id)
  const { etat, version } = await lire(env, id, idJoueur)
  if (etat.phase !== 'choix') throw new Erreur(409, 'Pas pendant un reconfinement')
  if (etat.joueur.manifeste || etat.joueur.manifestation < MANIFESTATION_MAX) throw new Erreur(409, 'La jauge de Manifestation n’est pas pleine')
  const b = await base(env, etat.langue)
  const m = manifestationDe(etat.equipe.map((x) => b.parId.get(x)!))
  const camps: Record<Cote, CampReco> = { joueur: { ...etat.joueur }, ia: { ...etat.ia } }
  const mains: Record<Cote, string[]> = { joueur: [...etat.main], ia: [...etat.mainIA] }
  const evenements = manifester(m, 'joueur', camps, mains)
  const suivant: EtatReco = { ...etat, joueur: camps.joueur, ia: camps.ia, main: mains.joueur, mainIA: mains.ia, revele: etat.revele || m.id === 'revelation' }
  await ecrire(env, id, idJoueur, version, suivant)
  // `manifestation` (celle de l'équipe) vient de la vue ; `declenchee` est celle qui vient de jouer
  return { declenchee: m, evenements, ...vuePublique(suivant, b) }
}

export async function traiterReco(env: Environnement, idJoueur: string, action: string, corps: Record<string, unknown>, maintenant: number) {
  switch (action) {
    case 'reco_debuter':
      return debuter(env, idJoueur, corps)
    case 'reco_jouer':
      return jouer(env, idJoueur, corps, maintenant)
    case 'reco_manifester':
      return manifesterJoueur(env, idJoueur, corps)
    default:
      return repondre(env, idJoueur, corps, maintenant)
  }
}
