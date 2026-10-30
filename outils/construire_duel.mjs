// Regroupe la fonction Edge « duel » (serveur/edge.ts) et le code partagé de src/engine en un seul fichier,
// supabase/functions/duel/index.js, que `supabase functions deploy duel --use-api` envoie tel quel.
// Usage : npm run duel   (à relancer après toute modification des règles des duels ou des questions)
import { build } from 'rolldown'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const sorties = [
  ['serveur/edge.ts', 'supabase/functions/duel/index.js'],
  // Même logique sans l'enveloppe Deno, pour outils/tester_duel.mjs
  ['serveur/duel.ts', 'outils/.cache/duel.mjs'],
  // Les règles de la Brèche de confinement seules, pour les tester une à une
  ['src/engine/breche.ts', 'outils/.cache/breche.mjs'],
]
for (const [entree, fichier] of sorties) {
  await build({
    cwd: racine,
    input: entree,
    platform: 'neutral',
    output: { file: fichier, format: 'esm', banner: '// Généré par outils/construire_duel.mjs : ne pas modifier à la main.' },
    logLevel: 'warn',
  })
}
console.log('fonction Edge duel -> supabase/functions/duel/index.js')
