/**
 * Atelier : un faux serveur pour essayer la Brèche de confinement sans la fonction Edge (atelier.html?breche).
 * Il remplace l'appel à la fonction « duel » par le moteur de src/engine/breche.ts, en local, avec une équipe
 * de démonstration. Rien n'est enregistré ni récompensé.
 */
import type { Base } from './data/catalogue'
import { campNeuf, choisirIA, initiative, issue, resoudre, role, terminee, type Camp } from './engine/breche'
import { ADVERSAIRES, DUREE_QUESTION, deckAdversaire, reponseAdversaire } from './engine/duel'
import { genererQuestion } from './engine/quiz'
import { supabase } from './state/enLigne'

export const EQUIPE_DEMO = ['scp-682', 'fim:epsilon-11', 'site:site-19', 'proto:110-montauk', 'entite:scarlet-king']

interface Etat {
  main: string[]
  mainIA: string[]
  tour: number
  joueur: Camp
  ia: Camp
  bonnes: number
  initiative: 'joueur' | 'ia' | null
  coupIA?: { carte: string; cible: number }
  coup?: { carte: string; cible: number }
  bonne?: number
  reponseIA?: { choix: number; temps: number; bonne: number }
  debut?: number
}

export function brancherFauxServeur(base: Base) {
  if (!supabase) return
  const adversaire = ADVERSAIRES[2]
  let e: Etat
  const vue = () => ({
    tour: e.tour,
    main: e.main,
    cartesIA: e.mainIA.length,
    joueur: e.joueur,
    ia: e.ia,
    initiative: e.initiative,
    revele: e.initiative === 'joueur' ? e.coupIA : undefined,
    bonnes: e.bonnes,
  })
  const carte = (id: string) => base.parId.get(id)!
  const actions: Record<string, (b: Record<string, unknown>) => unknown> = {
    breche_debuter: () => {
      e = {
        main: EQUIPE_DEMO.filter((id) => base.parId.has(id)),
        mainIA: deckAdversaire(base, adversaire).map((c) => c.id),
        tour: 1,
        joueur: campNeuf(),
        ia: campNeuf(),
        bonnes: 0,
        initiative: null,
      }
      return { id: 'demo', ...vue() }
    },
    breche_jouer: (b) => {
      const c = carte(String(b.carte))
      const cible = Number(b.cible)
      e.coupIA ??= (() => {
        const x = choisirIA(e.mainIA.map(carte), e.ia, e.joueur, e.initiative === 'ia' ? { carte: c, cible } : null, adversaire.precision)
        return { carte: x.carte.id, cible: x.cible }
      })()
      const q = genererQuestion(base, c, carte(e.coupIA.carte), false)
      const qIA = genererQuestion(base, carte(e.coupIA.carte), c, false)
      e.coup = { carte: c.id, cible }
      e.bonne = q.bonne
      // Pour tester l'initiative depuis la console de l'atelier
      ;(window as unknown as { brecheBonne: number }).brecheBonne = q.bonne
      e.reponseIA = { ...reponseAdversaire(adversaire, qIA), bonne: qIA.bonne }
      e.debut = Date.now()
      return { tour: e.tour, question: { intitule: q.intitule, document: q.document, options: q.options }, duree: DUREE_QUESTION, tempsIA: e.reponseIA.temps }
    },
    breche_repondre: (b) => {
      const temps = Math.min(DUREE_QUESTION, (Date.now() - e.debut!) / 1000)
      const juste = b.choix === e.bonne
      const justeIA = e.reponseIA!.choix === e.reponseIA!.bonne
      const cIA = carte(e.coupIA!.carte)
      const r = resoudre(e.joueur, e.ia, { carte: carte(e.coup!.carte), cible: e.coup!.cible, juste }, { carte: cIA, cible: e.coupIA!.cible, juste: justeIA })
      const tour = e.tour
      const resultat = {
        bonne: e.bonne,
        choix: typeof b.choix === 'number' ? b.choix : null,
        temps,
        coupIA: { carte: cIA.id, cible: e.coupIA!.cible, role: role(cIA), juste: justeIA, temps: e.reponseIA!.temps },
        evenements: r.evenements,
      }
      e = {
        ...e,
        tour: tour + 1,
        joueur: r.joueur,
        ia: r.ia,
        bonnes: e.bonnes + (juste ? 1 : 0),
        main: e.main.filter((x) => x !== e.coup!.carte),
        mainIA: e.mainIA.filter((x) => x !== cIA.id),
        initiative: initiative({ juste, temps }, { juste: justeIA, temps: e.reponseIA!.temps }),
        coupIA: undefined,
      }
      const fin = terminee(tour, r.joueur, r.ia) ? { issue: issue(r.joueur, r.ia), credits: 0, xp: 0, profil: null } : null
      if (!fin && e.initiative === 'joueur') {
        const x = choisirIA(e.mainIA.map(carte), e.ia, e.joueur, null, adversaire.precision)
        e.coupIA = { carte: x.carte.id, cible: x.cible }
      }
      return { ...resultat, ...vue(), fin }
    },
  }
  // supabase.functions est un accesseur qui recrée son client à chaque appel : on le masque sur l'instance
  const invoke = async (_nom: string, { body }: { body: Record<string, unknown> }) => {
    await new Promise((r) => setTimeout(r, 250))
    return { data: actions[String(body.action)]?.(body) ?? null, error: null }
  }
  Object.defineProperty(supabase, 'functions', { value: { invoke }, configurable: true })
}
