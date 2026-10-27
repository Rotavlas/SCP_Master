/**
 * Outils communs aux duels arbitrés par le serveur (contre l'IA et entre joueurs) : catalogue des cartes,
 * identité du joueur, appels aux fonctions SQL avec la clé de service.
 */
import { Base } from '../src/data/catalogue'
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
export const GRACE = 3

export class Erreur extends Error {
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

export async function base(env: Environnement, langue: Langue): Promise<Base> {
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

export async function joueur(env: Environnement, req: Request): Promise<string> {
  const jeton = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jeton) throw new Erreur(401, 'Connexion requise')
  const r = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.cleService, Authorization: `Bearer ${jeton}` } })
  if (!r.ok) throw new Erreur(401, 'Session expirée : reconnectez-vous.')
  const u = (await r.json()) as { id?: string }
  if (!u.id) throw new Erreur(401, 'Connexion requise')
  return u.id
}

export async function rpc<T>(env: Environnement, fonction: string, params: Record<string, unknown>): Promise<T> {
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

export const texte = (v: unknown) => (typeof v === 'string' ? v : '')
