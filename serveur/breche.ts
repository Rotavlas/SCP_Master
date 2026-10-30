/**
 * La « Brèche de confinement » contre l'IA, arbitrée par le serveur (fonction Edge « duel », actions breche_*).
 * Les règles sont dans src/engine/breche.ts. Le navigateur ne voit jamais la bonne réponse avant d'avoir répondu,
 * ni la carte de l'IA avant la résolution du tour, sauf quand il a l'initiative : l'IA s'engage alors la première
 * et sa carte lui est montrée. L'état est enregistré dans prive.duels_ia, comme les duels classiques.
 */
import {
  campNeuf,
  choisirIA,
  initiative as prendreInitiative,
  issue as issueFinale,
  resoudre,
  role,
  terminee,
  type Camp,
  type Evenement,
} from '../src/engine/breche'
import { ADVERSAIRES, DUREE_QUESTION, deckAdversaire, reponseAdversaire } from '../src/engine/duel'
import { genererQuestion } from '../src/engine/quiz'
import type { Langue } from '../src/types'
import { Erreur, GRACE, base, rpc, texte, type Environnement } from './commun'

export const ACTIONS_BRECHE = new Set(['breche_debuter', 'breche_jouer', 'breche_repondre'])

interface CoupIA {
  carte: string
  cible: number
}

export interface EtatBreche {
  mode: 'breche'
  niveau: number
  langue: Langue
  main: string[]
  mainIA: string[]
  tour: number
  joueur: Camp
  ia: Camp
  bonnes: number
  phase: 'choix' | 'question'
  /** Qui voit la carte de l'autre avant de choisir, ce tour-ci */
  initiative: 'joueur' | 'ia' | null
  /** Le coup de l'IA, choisi d'avance quand le joueur a l'initiative (et alors montré) */
  coupIA?: CoupIA
  coup?: { carte: string; cible: number }
  question?: { intitule: string; document?: string; options: string[]; bonne: number }
  reponseIA?: { choix: number; temps: number; bonne: number }
  debut?: number
}

async function lire(env: Environnement, id: string, joueur: string): Promise<{ etat: EtatBreche; version: number }> {
  const r = await rpc<{ etat: EtatBreche | null; version: number } | null>(env, 'duel_lire', { p_duel: id, p_joueur: joueur })
  if (!r?.etat || r.etat.mode !== 'breche') throw new Erreur(404, 'Confrontation introuvable ou déjà terminée')
  return { etat: r.etat, version: r.version }
}

async function ecrire(env: Environnement, id: string, joueur: string, version: number, etat: EtatBreche) {
  const ok = await rpc<boolean>(env, 'duel_ecrire', { p_duel: id, p_joueur: joueur, p_version: version, p_etat: etat })
  if (!ok) throw new Erreur(409, 'La confrontation a changé entre-temps : rechargez la page')
}

const adversaireDe = (niveau: number) => ADVERSAIRES.find((a) => a.niveau === niveau)!

/** Avec l'initiative du joueur, l'IA s'engage d'avance, sans voir son coup */
async function preparerTour(env: Environnement, etat: EtatBreche): Promise<EtatBreche> {
  if (etat.initiative !== 'joueur') return { ...etat, coupIA: undefined }
  const b = await base(env, etat.langue)
  const main = etat.mainIA.map((id) => b.parId.get(id)!)
  const c = choisirIA(main, etat.ia, etat.joueur, null, adversaireDe(etat.niveau).precision)
  return { ...etat, coupIA: { carte: c.carte.id, cible: c.cible } }
}

/** Ce que le navigateur peut savoir de la partie */
function vuePublique(etat: EtatBreche) {
  return {
    tour: etat.tour,
    main: etat.main,
    cartesIA: etat.mainIA.length,
    joueur: etat.joueur,
    ia: etat.ia,
    initiative: etat.initiative,
    revele: etat.initiative === 'joueur' ? etat.coupIA : undefined,
    bonnes: etat.bonnes,
  }
}

async function debuter(env: Environnement, idJoueur: string, corps: Record<string, unknown>) {
  const adversaire = ADVERSAIRES.find((a) => a.niveau === corps.niveau)
  if (!adversaire) throw new Erreur(400, 'Adversaire inconnu')
  const prep = await rpc<{ id: string; equipe: string[]; langue: Langue }>(env, 'duel_preparer', { p_joueur: idJoueur, p_niveau: adversaire.niveau })
  const b = await base(env, prep.langue)
  if (prep.equipe.some((id) => !b.parId.has(id))) throw new Erreur(409, 'Nouvelles fiches disponibles : rechargez la page')
  const etat: EtatBreche = {
    mode: 'breche',
    niveau: adversaire.niveau,
    langue: prep.langue,
    main: prep.equipe,
    mainIA: deckAdversaire(b, adversaire).map((c) => c.id),
    tour: 1,
    joueur: campNeuf(),
    ia: campNeuf(),
    bonnes: 0,
    phase: 'choix',
    initiative: null,
  }
  await ecrire(env, prep.id, idJoueur, 0, etat)
  return { id: prep.id, ...vuePublique(etat) }
}

async function jouer(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const id = texte(corps.id)
  const { etat, version } = await lire(env, id, idJoueur)
  if (etat.phase !== 'choix') throw new Erreur(409, 'Une question attend déjà votre réponse')
  const idCarte = texte(corps.carte)
  if (!etat.main.includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main")
  const cible = typeof corps.cible === 'number' && Number.isInteger(corps.cible) ? corps.cible : 0

  const b = await base(env, etat.langue)
  const adversaire = adversaireDe(etat.niveau)
  const carte = b.parId.get(idCarte)!
  // L'IA choisit maintenant, en voyant le coup du joueur si elle a l'initiative ; sinon à l'aveugle
  const coupIA =
    etat.coupIA ??
    (() => {
      const c = choisirIA(
        etat.mainIA.map((x) => b.parId.get(x)!),
        etat.ia,
        etat.joueur,
        etat.initiative === 'ia' ? { carte, cible } : null,
        adversaire.precision,
      )
      return { carte: c.carte.id, cible: c.cible }
    })()
  const carteIA = b.parId.get(coupIA.carte)!
  // Chacun répond sur sa propre carte
  const q = genererQuestion(b, carte, carteIA, false)
  const qIA = genererQuestion(b, carteIA, carte, false)
  const reponseIA = reponseAdversaire(adversaire, qIA)
  const suivant: EtatBreche = {
    ...etat,
    phase: 'question',
    coup: { carte: idCarte, cible },
    coupIA,
    question: { intitule: q.intitule, document: q.document, options: q.options, bonne: q.bonne },
    reponseIA: { ...reponseIA, bonne: qIA.bonne },
    debut: maintenant,
  }
  await ecrire(env, id, idJoueur, version, suivant)
  return {
    tour: etat.tour,
    question: { intitule: q.intitule, document: q.document, options: q.options },
    duree: DUREE_QUESTION,
    // Quand l'IA « a répondu », pour l'afficher pendant la question ; jamais son choix
    tempsIA: reponseIA.temps,
  }
}

async function repondre(env: Environnement, idJoueur: string, corps: Record<string, unknown>, maintenant: number) {
  const id = texte(corps.id)
  const { etat, version } = await lire(env, id, idJoueur)
  if (etat.phase !== 'question' || !etat.question || !etat.coup || !etat.coupIA || !etat.reponseIA || etat.debut === undefined) {
    throw new Erreur(409, 'Aucune question en cours')
  }
  const q = etat.question
  const ecoule = (maintenant - etat.debut) / 1000
  const choix = corps.choix
  // Hors délai ou réponse mal formée : comme si le temps était écoulé
  const valide = typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && ecoule <= DUREE_QUESTION + GRACE
  const choixRetenu = valide ? (choix as number) : null
  const temps = Math.min(DUREE_QUESTION, ecoule)
  const juste = choixRetenu === q.bonne
  const justeIA = etat.reponseIA.choix === etat.reponseIA.bonne

  const b = await base(env, etat.langue)
  const carte = b.parId.get(etat.coup.carte)!
  const carteIA = b.parId.get(etat.coupIA.carte)!
  const r = resoudre(etat.joueur, etat.ia, { carte, cible: etat.coup.cible, juste }, { carte: carteIA, cible: etat.coupIA.cible, juste: justeIA })
  const suivant: EtatBreche = {
    ...etat,
    phase: 'choix',
    tour: etat.tour + 1,
    joueur: r.joueur,
    ia: r.ia,
    bonnes: etat.bonnes + (juste ? 1 : 0),
    main: etat.main.filter((x) => x !== etat.coup!.carte),
    mainIA: etat.mainIA.filter((x) => x !== etat.coupIA!.carte),
    initiative: prendreInitiative({ juste, temps }, { juste: justeIA, temps: etat.reponseIA.temps }),
    coup: undefined,
    coupIA: undefined,
    question: undefined,
    reponseIA: undefined,
    debut: undefined,
  }
  const resultat = {
    bonne: q.bonne,
    choix: choixRetenu,
    temps,
    coupIA: { carte: carteIA.id, cible: etat.coupIA.cible, role: role(carteIA), juste: justeIA, temps: etat.reponseIA.temps },
    evenements: r.evenements satisfies Evenement[],
  }
  if (!terminee(etat.tour, r.joueur, r.ia)) {
    const pret = await preparerTour(env, suivant)
    await ecrire(env, id, idJoueur, version, pret)
    return { ...resultat, ...vuePublique(pret), fin: null }
  }
  const issue = issueFinale(r.joueur, r.ia)
  const gains = await rpc<{ credits: number; xp: number; profil: unknown }>(env, 'duel_clore', {
    p_duel: id,
    p_joueur: idJoueur,
    p_version: version,
    p_etat: suivant,
    p_issue: issue,
    p_bonnes: suivant.bonnes,
    p_questions: etat.tour,
  })
  return { ...resultat, ...vuePublique(suivant), fin: { issue, ...gains } }
}

export async function traiterBreche(env: Environnement, idJoueur: string, action: string, corps: Record<string, unknown>, maintenant: number) {
  switch (action) {
    case 'breche_debuter':
      return debuter(env, idJoueur, corps)
    case 'breche_jouer':
      return jouer(env, idJoueur, corps, maintenant)
    default:
      return repondre(env, idJoueur, corps, maintenant)
  }
}
