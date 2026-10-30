/**
 * Atelier : les confrontations contre l'IA jouées avec le vrai code du serveur (serveur/duel.ts), dans le
 * navigateur, sans fonction Edge ni base. Les fonctions SQL duel_* sont simulées en mémoire et l'équipe est
 * une équipe de démonstration. Rien n'est enregistré ni récompensé.
 */
import { traiter } from '../serveur/duel'
import { supabase } from './state/enLigne'

export const EQUIPE_DEMO = ['scp-682', 'fim:epsilon-11', 'site:site-19', 'proto:110-montauk', 'entite:scarlet-king']

const URL_FAUX = 'https://atelier.invalid'

interface Ligne {
  etat: unknown
  version: number
}

const parties = new Map<string, Ligne>()

/** L'état complet de la partie en cours, bonne réponse comprise : pour tester depuis la console de l'atelier */
export const etatAtelier = () => [...parties.values()].at(-1)?.etat

export function brancherServeurLocal(equipe: string[] = EQUIPE_DEMO) {
  if (!supabase || (window as unknown as { serveurLocal?: boolean }).serveurLocal) return
  ;(window as unknown as { serveurLocal: boolean; etatAtelier: typeof etatAtelier }).serveurLocal = true
  ;(window as unknown as { etatAtelier: typeof etatAtelier }).etatAtelier = etatAtelier
  const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } })
  const vraiFetch = window.fetch.bind(window)
  window.fetch = async (entree, init) => {
    const url = String(entree instanceof Request ? entree.url : entree)
    if (!url.startsWith(URL_FAUX)) return vraiFetch(entree, init)
    if (url.endsWith('/auth/v1/user')) return json({ id: 'agent-atelier' })
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
    }
    return json(null)
  }
  const env = { url: URL_FAUX, cleService: 'atelier', site: location.origin, origines: [location.origin] }
  // supabase.functions est un accesseur qui recrée son client à chaque appel : on le masque sur l'instance
  const invoke = async (_nom: string, { body }: { body: Record<string, unknown> }) => {
    const req = new Request(`${URL_FAUX}/functions/v1/duel`, {
      method: 'POST',
      headers: { Authorization: 'Bearer atelier', 'Content-Type': 'application/json', Origin: location.origin },
      body: JSON.stringify(body),
    })
    const r = await traiter(req, env)
    const data = await r.json()
    return r.ok ? { data, error: null } : { data: null, error: { message: data.message as string } }
  }
  Object.defineProperty(supabase, 'functions', { value: { invoke }, configurable: true })
}
