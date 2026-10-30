/**
 * Le Reconfinement entre joueurs (duels classés et amicaux) : les règles de src/engine/reconfinement.ts, jouées
 * en même temps par deux agents. Chaque tour, chacun choisit une carte en secret ; les deux sont révélées
 * ensemble, puis chacun reconfine l'anomalie que l'autre a libérée chez lui, sur sa propre question. Les mains
 * sont sur la table (comme contre l'IA) ; seules la carte choisie avant la révélation et les bonnes réponses
 * restent dans l'état secret. Ces fonctions ne touchent pas au réseau : serveur/jcj.ts les lit et les écrit.
 */
import type { Base } from '../src/data/catalogue'
import type { Effet } from '../src/engine/effets'
import { questionReconfinement } from '../src/engine/quiz'
import {
  MANIFESTATION_MAX,
  appliquerLiberation,
  campReco,
  finDeTour,
  gainReponse,
  issueReco,
  manifestationDe,
  manifester,
  nature,
  preparerReconfinement,
  remplir,
  soutien,
  termine,
  INTEGRITE_SITE,
  type CampReco,
  type Evenement,
  type Manifestation,
  type Reconfinement,
} from '../src/engine/reconfinement'
import type { Langue } from '../src/types'
import { Erreur, GRACE } from './commun'

type Cote = 'a' | 'b'
type ParCote<T> = Record<Cote, T>
const autre = (c: Cote): Cote => (c === 'a' ? 'b' : 'a')
const COTES: Cote[] = ['a', 'b']
/** Le moteur parle de « joueur » et d'« ia » : ici, a et b */
const cote = (x: 'joueur' | 'ia'): Cote => (x === 'joueur' ? 'a' : 'b')
const camp = (c: Cote): 'joueur' | 'ia' => (c === 'a' ? 'joueur' : 'ia')

/** Temps pour choisir sa carte ; après un tour, quelques secondes de plus pour voir le résultat */
export const DUREE_CHOIX_RECO = 25
export const PAUSE_RECO = 5

export interface RecoPublic {
  question?: { intitule: string; document?: string; options: string[]; retirees: number[]; duree: number }
  effet: Effet
  alteree: boolean
  actif: boolean
  auto: 'reussite' | 'echec' | null
}

export interface EtatRecoJcj {
  mode: 'reco'
  tour: number
  phase: 'choix' | 'question' | 'fin'
  echeance: number
  maintenant: number
  camps: ParCote<CampReco>
  mains: ParCote<string[]>
  manifestations: ParCote<Manifestation>
  choisi: ParCote<boolean>
  /** Les cartes du tour, révélées quand les deux sont choisies */
  cartes?: ParCote<string>
  /** Le reconfinement de chacun : sa question porte sur l'anomalie de l'autre */
  recos?: Partial<ParCote<RecoPublic>>
  repondu: ParCote<boolean>
  dernier?: {
    tour: number
    cartes: ParCote<string>
    evenements: (Evenement & { cote: Cote })[]
    reponses: Partial<ParCote<{ choix: number | null; bonne: number; temps: number }>>
  }
  /** La dernière Manifestation déclenchée, pour que les deux écrans la jouent */
  manifestee?: { cote: Cote; m: Manifestation; n: number }
  fin?: { issue: Cote | 'nul'; abandon?: Cote }
}

export interface SecretRecoJcj {
  langue: Langue
  choix: Partial<ParCote<string>>
  bonnes: Partial<ParCote<number>>
  recos: Partial<ParCote<Reconfinement>>
  debut?: number
  reponses: Partial<ParCote<{ choix: number | null; temps: number; regarde: boolean }>>
}

export const estReco = (etat: unknown): etat is EtatRecoJcj => (etat as { mode?: string } | null)?.mode === 'reco'

export function etatInitialReco(equipes: ParCote<string[]>, langue: Langue, b: Base, maintenant: number): { etat: EtatRecoJcj; secret: SecretRecoJcj } {
  return {
    etat: {
      mode: 'reco',
      tour: 1,
      phase: 'choix',
      echeance: maintenant + DUREE_CHOIX_RECO * 1000,
      maintenant,
      camps: { a: campReco(), b: campReco() },
      mains: { a: [...equipes.a], b: [...equipes.b] },
      manifestations: {
        a: manifestationDe(equipes.a.map((id) => b.parId.get(id)!)),
        b: manifestationDe(equipes.b.map((id) => b.parId.get(id)!)),
      },
      choisi: { a: false, b: false },
      repondu: { a: false, b: false },
    },
    secret: { langue, choix: {}, bonnes: {}, recos: {}, reponses: {} },
  }
}

function aRetirer(options: string[], bonne: number, n: number): number[] {
  const mauvaises = options.map((_, i) => i).filter((i) => i !== bonne)
  const retirees: number[] = []
  while (retirees.length < n && mauvaises.length) retirees.push(mauvaises.splice(Math.floor(Math.random() * mauvaises.length), 1)[0])
  return retirees
}

/** Les deux cartes sont choisies : on les révèle et chacun reçoit son reconfinement */
function lancer(etat: EtatRecoJcj, secret: SecretRecoJcj, b: Base, maintenant: number) {
  const cartes = { a: secret.choix.a!, b: secret.choix.b! }
  etat.cartes = cartes
  etat.recos = {}
  secret.recos = {}
  secret.bonnes = {}
  secret.reponses = {}
  let duree = 0
  for (const x of COTES) {
    // x reconfine l'anomalie de l'autre, s'il en a libéré une
    const anomalie = b.parId.get(cartes[autre(x)])!
    if (nature(anomalie) !== 'anomalie') continue
    const r = preparerReconfinement(anomalie, etat.camps[x], b.parId.get(cartes[x])!)
    secret.recos[x] = r
    const pub: RecoPublic = { effet: r.effet, alteree: r.alteree, actif: r.actif, auto: r.auto }
    if (!r.auto) {
      const q = questionReconfinement(b, anomalie)
      pub.question = { intitule: q.intitule, document: q.document, options: q.options, retirees: aRetirer(q.options, q.bonne, r.retirees), duree: r.duree }
      secret.bonnes[x] = q.bonne
      duree = Math.max(duree, r.duree)
    }
    etat.recos[x] = pub
  }
  etat.repondu = { a: secret.bonnes.a === undefined, b: secret.bonnes.b === undefined }
  if (etat.repondu.a && etat.repondu.b) return resoudre(etat, secret, b, maintenant)
  etat.phase = 'question'
  etat.echeance = maintenant + duree * 1000
  secret.debut = maintenant
}

/** Fin du tour : libérations, soutiens, jauges, contagion ; puis tour suivant ou fin du duel */
function resoudre(etat: EtatRecoJcj, secret: SecretRecoJcj, b: Base, maintenant: number) {
  const cartes = etat.cartes!
  const C: Record<'joueur' | 'ia', CampReco> = { joueur: { ...etat.camps.a }, ia: { ...etat.camps.b } }
  const mains: Record<'joueur' | 'ia', string[]> = {
    joueur: etat.mains.a.filter((x) => x !== cartes.a),
    ia: etat.mains.b.filter((x) => x !== cartes.b),
  }
  const ev: Evenement[] = []
  const consommes: Record<'joueur' | 'ia', Partial<Record<keyof CampReco, boolean>>> = { joueur: {}, ia: {} }
  for (const x of COTES) {
    const c = b.parId.get(cartes[x])!
    if (nature(c) === 'soutien' && soutien(c) === 'site') {
      const v = Math.round(c.def * 0.4)
      C[camp(x)].integrite = Math.min(INTEGRITE_SITE, C[camp(x)].integrite + v)
      ev.push({ camp: camp(x), type: 'soin', valeur: v, texte: `${c.num ?? c.nm} renforce le Site : +${v}` })
    }
  }
  const reponses: Partial<ParCote<{ choix: number | null; bonne: number; temps: number }>> = {}
  for (const x of COTES) {
    // L'anomalie libérée par x, que l'autre devait reconfiner
    const y = autre(x)
    const r = secret.recos[y]
    if (!r) continue
    const anomalie = b.parId.get(cartes[x])!
    const rep = secret.reponses[y]
    const bonne = secret.bonnes[y]
    const issue = r.auto
      ? { reconfinee: r.auto === 'reussite', temps: 0 }
      : { reconfinee: !!rep && rep.choix === bonne, temps: rep?.temps ?? r.duree, regarde: rep?.regarde }
    if (!r.auto && bonne !== undefined) reponses[y] = { choix: rep?.choix ?? null, bonne, temps: issue.temps }
    const { poche } = appliquerLiberation(camp(x), C, anomalie, r, issue, ev)
    if (poche && mains[camp(y)].length) mains[camp(y)].splice(Math.floor(Math.random() * mains[camp(y)].length), 1)
    // Reconfinée, l'anomalie retourne dans la main de son propriétaire
    if (issue.reconfinee) mains[camp(x)].push(anomalie.id)
    if (!r.auto) remplir(C[camp(y)], gainReponse(issue.reconfinee, issue.temps))
    for (const k of ['reconfinementsAuto', 'questionsCourtes', 'echecsAuto', 'questionsFaciles'] as const) consommes[camp(y)][k] = true
  }
  finDeTour(C, consommes, ev)
  etat.camps = { a: C.joueur, b: C.ia }
  etat.mains = { a: mains.joueur, b: mains.ia }
  etat.dernier = { tour: etat.tour, cartes, evenements: ev.map((e) => ({ ...e, cote: cote(e.camp) })), reponses }
  etat.recos = undefined
  etat.cartes = undefined
  secret.choix = {}
  secret.bonnes = {}
  secret.recos = {}
  secret.reponses = {}
  secret.debut = undefined
  if (termine(etat.tour, C.joueur, C.ia) || !mains.joueur.length || !mains.ia.length) {
    const issue = issueReco(C.joueur, C.ia)
    etat.phase = 'fin'
    etat.fin = { issue: issue === 'victoire' ? 'a' : issue === 'defaite' ? 'b' : 'nul' }
    return
  }
  etat.tour++
  etat.phase = 'choix'
  etat.choisi = { a: false, b: false }
  etat.repondu = { a: false, b: false }
  etat.echeance = maintenant + (DUREE_CHOIX_RECO + PAUSE_RECO) * 1000
}

export function choisirReco(etat: EtatRecoJcj, secret: SecretRecoJcj, c: Cote, idCarte: string, b: Base, maintenant: number) {
  if (etat.phase !== 'choix') throw new Erreur(409, "Ce n'est pas le moment de jouer une carte")
  if (etat.choisi[c]) throw new Erreur(409, 'Carte déjà jouée pour ce tour')
  if (!etat.mains[c].includes(idCarte)) throw new Erreur(400, "Cette carte n'est plus dans votre main")
  secret.choix[c] = idCarte
  etat.choisi[c] = true
  if (etat.choisi.a && etat.choisi.b) lancer(etat, secret, b, maintenant)
}

export function repondreReco(etat: EtatRecoJcj, secret: SecretRecoJcj, c: Cote, choix: unknown, regarde: boolean, b: Base, maintenant: number) {
  const q = etat.recos?.[c]?.question
  if (etat.phase !== 'question' || !q || secret.debut === undefined) throw new Erreur(409, 'Aucun reconfinement en cours')
  if (etat.repondu[c]) throw new Erreur(409, 'Vous avez déjà répondu')
  const ecoule = (maintenant - secret.debut) / 1000
  const valide =
    typeof choix === 'number' && Number.isInteger(choix) && choix >= 0 && choix < q.options.length && !q.retirees.includes(choix) && ecoule <= q.duree + GRACE
  secret.reponses[c] = { choix: valide ? (choix as number) : null, temps: Math.min(q.duree, ecoule), regarde }
  etat.repondu[c] = true
  if (etat.repondu.a && etat.repondu.b) resoudre(etat, secret, b, maintenant)
}

export function manifesterJcj(etat: EtatRecoJcj, secret: SecretRecoJcj, c: Cote) {
  if (etat.phase !== 'choix') throw new Erreur(409, 'Pas pendant un reconfinement')
  if (etat.camps[c].manifeste || etat.camps[c].manifestation < MANIFESTATION_MAX) throw new Erreur(409, 'La jauge de Manifestation n’est pas pleine')
  const C: Record<'joueur' | 'ia', CampReco> = { joueur: { ...etat.camps.a }, ia: { ...etat.camps.b } }
  // Une carte déjà choisie en secret ne peut pas être enchaînée : elle est déjà sur la table
  const garde = (x: Cote) => etat.mains[x].filter((id) => id !== secret.choix[x])
  const mains: Record<'joueur' | 'ia', string[]> = { joueur: garde('a'), ia: garde('b') }
  manifester(etat.manifestations[c], camp(c), C, mains)
  for (const x of COTES) if (secret.choix[x]) mains[camp(x)].push(secret.choix[x]!)
  etat.camps = { a: C.joueur, b: C.ia }
  etat.mains = { a: mains.joueur, b: mains.ia }
  etat.manifestee = { cote: c, m: etat.manifestations[c], n: (etat.manifestee?.n ?? 0) + 1 }
}

/** Les délais dépassés : carte jouée d'office, reconfinement sans réponse. Renvoie true si l'état a changé. */
export function appliquerDelaisReco(etat: EtatRecoJcj, secret: SecretRecoJcj, b: Base, maintenant: number): boolean {
  if (etat.phase === 'choix' && maintenant > etat.echeance) {
    for (const c of COTES) {
      if (!etat.choisi[c]) {
        secret.choix[c] = etat.mains[c][0]
        etat.choisi[c] = true
      }
    }
    lancer(etat, secret, b, maintenant)
    return true
  }
  if (etat.phase === 'question' && maintenant > etat.echeance + GRACE * 1000) {
    for (const c of COTES) {
      if (!etat.repondu[c]) {
        secret.reponses[c] = { choix: null, temps: etat.recos?.[c]?.question?.duree ?? 20, regarde: false }
        etat.repondu[c] = true
      }
    }
    resoudre(etat, secret, b, maintenant)
    return true
  }
  return false
}
