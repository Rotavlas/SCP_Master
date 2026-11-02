/**
 * Atelier : les confrontations jouées avec le vrai code du serveur (serveur/duel.ts), dans le navigateur, sans
 * fonction Edge ni base. Les fonctions SQL duel_* et jcj_* sont simulées en mémoire, l'équipe est une équipe de
 * démonstration ; pour les duels entre joueurs, un adversaire simulé joue de son côté, et le direct (Realtime)
 * est imité. Rien n'est enregistré ni récompensé.
 */
import { traiter } from '../serveur/duel'
import { supabase } from './state/enLigne'

export const EQUIPE_DEMO = ['scp-682', 'fim:epsilon-11', 'site:site-19', 'proto:110-montauk', 'entite:scarlet-king']
/** L'équipe de l'adversaire simulé des duels entre joueurs */
export const EQUIPE_ADVERSE = ['scp-173', 'scp-096', 'scp-055', 'scp-106', 'dr-clef-s-proposal']

const URL_FAUX = 'https://atelier.invalid'
const MOI = 'agent-atelier'
const LUI = 'agent-adverse'

interface Ligne {
  etat: unknown
  version: number
}

const parties = new Map<string, Ligne>()

/** L'Épreuve de la semaine simulée ; ?semaine=AAAA-MM-JJ pour en voir une autre */
let epreuve: (Ligne & { termine: boolean }) | null = null
const semaineAtelier = new URLSearchParams(location.search).get('semaine') ?? '2026-11-02'

/** Le duel entre joueurs simulé (les colonnes de public.duels_jcj et prive.duels_jcj_secret) */
let duelJcj: {
  id: string
  statut: string
  classe: boolean
  etat: unknown
  secret: unknown
  version: number
  resultat: unknown
} | null = null
const ecouteurs = new Set<() => void>()

/** L'état complet de la partie en cours, bonne réponse comprise : pour tester depuis la console de l'atelier */
export const etatAtelier = () => (duelJcj ? { etat: duelJcj.etat, secret: duelJcj.secret } : [...parties.values()].at(-1)?.etat)

const enHall = new URLSearchParams(location.search).get('mode') === 'hall'
const DEMO_HALL: Record<string, () => unknown> = {
  tableau_duels: () => (enHall ? { elo: 1184, rang: 12, jcj: { victoires: 9, defaites: 6, nuls: 1 }, enLigne: 7, iaRestants: 3, jcjRestants: 5 } : null),
  missions: () =>
    enHall
      ? [
          { id: 'j-dossiers', periode: 'jour', titre: 'Ouvrir 3 dossiers', objectif: 3, progres: 3, credits: 60, dossiers: 0, fin: '', reclamee: false },
          {
            id: 'j-victoires',
            periode: 'jour',
            titre: 'Gagner 2 confrontations contre l’IA',
            objectif: 2,
            progres: 1,
            credits: 80,
            dossiers: 0,
            fin: '',
            reclamee: false,
          },
          { id: 'j-vendre', periode: 'jour', titre: 'Vendre une fiche au marché', objectif: 1, progres: 0, credits: 60, dossiers: 0, fin: '', reclamee: false },
          {
            id: 's-agents',
            periode: 'semaine',
            titre: 'Jouer 5 duels entre agents',
            objectif: 5,
            progres: 2,
            credits: 600,
            dossiers: 0,
            fin: '',
            reclamee: false,
          },
        ]
      : null,
  rapport: () =>
    enHall
      ? {
          serie: 4,
          fait: false,
          jour: 5,
          recompenses: [1, 2, 3, 4, 5, 6, 7].map((jour) => ({
            jour,
            credits: [100, 150, 0, 250, 0, 400, 0][jour - 1],
            dossiers: [0, 0, 1, 0, 2, 0, 0][jour - 1],
            keter: jour === 7 ? 1 : 0,
          })),
        }
      : null,
  piste: () =>
    enHall
      ? {
          xp: 3400,
          reclame: 6,
          atteint: 8,
          paliers: Array.from({ length: 30 }, (_, i) => {
            const n = i + 1
            return { palier: n, xp: Math.round((100 * n ** 1.8) / 10) * 10, credits: 50 + 15 * n, dossiers: n % 3 ? 0 : 1, keter: n % 10 ? 0 : 1 }
          }),
        }
      : null,
  objectifs_proches: () =>
    enHall
      ? [
          { type: 'rapport', jour: 5, serie: 4 },
          { type: 'piste_prete', paliers: 2 },
          { type: 'album', titre: 'Initiatives de Réponse Automatisée', manque: 2 },
          { type: 'raid', carte: 'scp-682', manque: 12 },
          { type: 'epreuve' },
        ]
      : null,
  fil_clan: () =>
    enHall
      ? [
          { type: 'tirage', pseudo: 'Dr Clef', carte: 'entite:scarlet-king', numero: 7, le: new Date(Date.now() - 600_000).toISOString() },
          { type: 'raid', carte: 'scp-682', le: new Date(Date.now() - 3_600_000).toISOString() },
          { type: 'victoire', pseudo: 'Bright', contre: 'Iris Thompson', classe: true, le: new Date(Date.now() - 7_200_000).toISOString() },
          { type: 'epreuve', pseudo: 'Agent atelier', score: 1012, le: new Date(Date.now() - 86_400_000).toISOString() },
          { type: 'tirage', pseudo: 'Bright', carte: 'scp-096', le: new Date(Date.now() - 2 * 86_400_000).toISOString() },
          { type: 'album', pseudo: 'Dr Clef', page: 'Codes de confinement', le: new Date(Date.now() - 3 * 86_400_000).toISOString() },
          { type: 'arrivee', pseudo: 'Iris Thompson', le: new Date(Date.now() - 5 * 86_400_000).toISOString() },
        ]
      : null,
  epreuve: () =>
    enHall
      ? {
          semaine: semaineAtelier,
          fin: new Date(Date.now() + 4 * 86_400_000).toISOString(),
          moi: { score: 1012, bonnes: 8, termine: true, rang: 3 },
          participants: 27,
          classement: [
            { pseudo: 'Dr Clef', score: 1288, bonnes: 9, duree: 141, rang: 1 },
            { pseudo: 'Iris Thompson', score: 1120, bonnes: 8, duree: 160, rang: 2 },
            { pseudo: 'Agent atelier', score: 1012, bonnes: 8, duree: 175, rang: 3 },
            { pseudo: 'Bright', score: 870, bonnes: 7, duree: 190, rang: 4 },
          ],
          dernier: { semaine: '2026-10-26', score: 940, rang: 5, credits: 500 },
        }
      : null,
  raid: () =>
    enHall
      ? {
          fin: new Date(Date.now() + 4 * 86_400_000).toISOString(),
          requis: 40,
          credits: 500,
          courant: {
            semaine: semaineAtelier,
            cible: 'scp-682',
            pv: 850,
            degats: 512,
            vaincue: false,
            moi: 96,
            reclame: false,
            contributeurs: [
              { pseudo: 'Dr Clef', degats: 210 },
              { pseudo: 'Agent atelier', degats: 96 },
              { pseudo: 'Bright', degats: 206 },
            ],
          },
          precedent: { semaine: '2026-10-26', cible: 'scp-106', pv: 850, degats: 900, vaincue: true, moi: 120, reclame: false, contributeurs: [] },
        }
      : null,
}

export function brancherServeurLocal(equipe: string[] = EQUIPE_DEMO) {
  if (!supabase || (window as unknown as { serveurLocal?: boolean }).serveurLocal) return
  ;(window as unknown as { serveurLocal: boolean; etatAtelier: typeof etatAtelier }).serveurLocal = true
  ;(window as unknown as { etatAtelier: typeof etatAtelier }).etatAtelier = etatAtelier
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const preparation = () => ({ id: duelJcj!.id, joueurA: MOI, joueurB: LUI, classe: true, equipeA: equipe, equipeB: EQUIPE_ADVERSE, langue: 'vo' })
  const vraiFetch = window.fetch.bind(window)
  window.fetch = async (entree, init) => {
    const url = String(entree instanceof Request ? entree.url : entree)
    if (!url.startsWith(URL_FAUX)) return vraiFetch(entree, init)
    if (url.endsWith('/auth/v1/user')) {
      const jeton = new Headers(init?.headers).get('Authorization')
      return json({ id: jeton?.endsWith('adverse') ? LUI : MOI })
    }
    const p = JSON.parse(String(init?.body ?? '{}'))
    switch (url.split('/rpc/')[1]) {
      case 'duel_preparer': {
        const id = crypto.randomUUID()
        parties.clear()
        parties.set(id, { etat: null, version: 0 })
        return json({ id, equipe, langue: 'vo' })
      }
      case 'duel_lire': {
        const l = parties.get(p.p_duel)
        return json(l?.etat ? l : null)
      }
      case 'duel_ecrire': {
        const l = parties.get(p.p_duel)
        if (!l || l.version !== p.p_version) return json(false)
        parties.set(p.p_duel, { etat: p.p_etat, version: l.version + 1 })
        return json(true)
      }
      case 'duel_clore':
        parties.delete(p.p_duel)
        return json({ credits: 0, xp: 0, profil: null })
      // L'Épreuve de la semaine : une tentative en mémoire, à recommencer en rechargeant la page
      case 'epreuve_preparer':
        return json({ semaine: semaineAtelier, langue: 'vo', etat: epreuve?.etat ?? null, version: epreuve?.version ?? 0, termine: epreuve?.termine ?? false })
      case 'epreuve_ecrire':
        if ((epreuve?.version ?? 0) !== p.p_version || epreuve?.termine) return json(false)
        epreuve = { etat: p.p_etat, version: p.p_version + 1, termine: p.p_termine }
        return json(true)
      // Les duels entre joueurs : un seul, contre l'adversaire simulé
      case 'jcj_entrer_file':
        if (!duelJcj || duelJcj.statut === 'termine') {
          duelJcj = { id: crypto.randomUUID(), statut: 'preparation', classe: true, etat: {}, secret: null, version: 0, resultat: null }
          return json({ preparer: preparation() })
        }
        return json({ enCours: duelJcj.id })
      case 'jcj_preparer':
        return json(preparation())
      case 'jcj_quitter_file':
        return json(null)
      case 'jcj_lire':
        return json(
          duelJcj && {
            statut: duelJcj.statut,
            classe: duelJcj.classe,
            joueurA: MOI,
            joueurB: LUI,
            pseudoA: 'Vous',
            pseudoB: 'Agent Simulé',
            eloA: 1000,
            eloB: 1000,
            etat: duelJcj.etat,
            secret: duelJcj.secret,
            version: duelJcj.version,
            resultat: duelJcj.resultat,
          },
        )
      case 'jcj_ecrire':
        if (!duelJcj || duelJcj.version !== p.p_version) return json(false)
        Object.assign(duelJcj, { etat: p.p_etat, secret: p.p_secret, version: duelJcj.version + 1, statut: 'en_cours' })
        setTimeout(() => ecouteurs.forEach((f) => f()), 30)
        return json(true)
      case 'jcj_clore': {
        const gains = { credits: 0, xp: 0, elo: 0, profil: null }
        if (duelJcj) Object.assign(duelJcj, { etat: p.p_etat, version: duelJcj.version + 1, statut: 'termine', resultat: { a: gains, b: gains } })
        setTimeout(() => ecouteurs.forEach((f) => f()), 30)
        return json({ a: gains, b: gains })
      }
    }
    return json(null)
  }
  const env = { url: URL_FAUX, cleService: 'atelier', site: location.origin, origines: [location.origin] }
  const appel = async (body: Record<string, unknown>, jeton = 'atelier') => {
    const req = new Request(`${URL_FAUX}/functions/v1/duel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Origin: location.origin },
      body: JSON.stringify(body),
    })
    const r = await traiter(req, env)
    return { ok: r.ok, data: await r.json() }
  }
  // supabase.functions est un accesseur qui recrée son client à chaque appel : on le masque sur l'instance
  const invoke = async (_nom: string, { body }: { body: Record<string, unknown> }) => {
    const r = await appel(body)
    return r.ok ? { data: r.data, error: null } : { data: null, error: { message: r.data.message as string } }
  }
  Object.defineProperty(supabase, 'functions', { value: { invoke }, configurable: true })
  // Le classement de l'Épreuve et le raid ne se lisent qu'en ligne : ici, des données de démonstration (?mode=hall)
  const vraiRpc = supabase.rpc.bind(supabase)
  Object.defineProperty(supabase, 'rpc', {
    value: (nom: string, params?: object) => (nom in DEMO_HALL ? Promise.resolve({ data: DEMO_HALL[nom](), error: null }) : vraiRpc(nom, params)),
    configurable: true,
  })
  // Le direct : chaque écriture du duel prévient l'écran, comme Realtime
  const canal = {
    on: (_t: string, _f: unknown, rappel: () => void) => {
      ecouteurs.add(rappel)
      return canal
    },
    subscribe: () => canal,
  }
  Object.defineProperty(supabase, 'channel', { value: () => canal, configurable: true })
  Object.defineProperty(supabase, 'removeChannel', { value: async () => 'ok', configurable: true })

  // L'adversaire simulé : il pose sa première carte après 2 s, et répond (juste deux fois sur trois) après 4 s
  setInterval(async () => {
    if (!duelJcj || duelJcj.statut !== 'en_cours') return
    const v = (await appel({ action: 'jcj_etat', id: duelJcj.id }, 'adverse')).data
    const e = v?.etat
    if (!e || e.mode !== 'reco') return
    const depuis = (Date.now() - e.maintenant) / 1000
    if (e.phase === 'choix' && !e.choisi.b && depuis > 2) await appel({ action: 'jcj_jouer', id: duelJcj.id, carte: v.main[0] }, 'adverse')
    const q = e.recos?.b?.question
    if (e.phase === 'question' && q && !e.repondu.b && depuis > 4) {
      const bonne = (duelJcj.secret as { bonnes: { b?: number } }).bonnes.b ?? 0
      const choix = Math.random() < 0.66 ? bonne : q.options.map((_: string, i: number) => i).find((i: number) => i !== bonne && !q.retirees.includes(i))
      await appel({ action: 'jcj_repondre', id: duelJcj.id, choix }, 'adverse')
    }
  }, 1000)
}
