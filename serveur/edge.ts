/**
 * Point d'entrée de la fonction Edge « duel » sur Supabase (Deno).
 * `npm run duel` regroupe ce fichier et le code partagé de src/engine dans supabase/functions/duel/index.js.
 */
import { traiter } from './duel'

declare const Deno: {
  env: { get(nom: string): string | undefined }
  serve(gestionnaire: (req: Request) => Response | Promise<Response>): void
}

/** Clé de service : l'ancienne (JWT) si elle existe, sinon la nouvelle clé secrète par défaut. */
function cleService(): string {
  const ancienne = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (ancienne) return ancienne
  const secretes = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  return secretes.default ?? Object.values(secretes)[0] ?? ''
}

const site = Deno.env.get('SITE_JEU') ?? 'https://scp-masters.vercel.app'
const env = {
  url: Deno.env.get('SUPABASE_URL') ?? '',
  cleService: cleService(),
  site,
  origines: [site, 'http://localhost:5191'],
}

Deno.serve((req) => traiter(req, env))
