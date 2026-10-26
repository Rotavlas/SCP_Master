// Génère supabase/catalogue.sql à partir de public/data/cards.json : le serveur a besoin
// de l'identifiant, du type et de la rareté de chaque carte pour tirer les boosters.
// Une instruction par couple type × rareté, pour un fichier assez léger à coller dans le SQL Editor.
// Usage : npm run catalogue-sql   (à relancer après chaque `npm run cartes`, puis à exécuter sur la base)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const { cartes } = JSON.parse(readFileSync(`${racine}public/data/cards.json`, 'utf8'))

const groupes = new Map()
for (const c of cartes) {
  const cle = `${c.k}${c.ra}`
  if (!groupes.has(cle)) groupes.set(cle, [])
  groupes.get(cle).push(c.id)
}

const echapper = (texte) => `'${texte.replaceAll("'", "''")}'`
const instructions = [...groupes].map(
  ([cle, ids]) =>
    `insert into public.cartes (id, k, ra)\nselect id, '${cle[0]}', ${cle[1]} from unnest(array[${ids.map(echapper).join(',')}]) as id\n` +
    'on conflict (id) do update set k = excluded.k, ra = excluded.ra;',
)

// Les cartes retirées du catalogue restent en base : des joueurs peuvent en posséder des exemplaires.
writeFileSync(
  `${racine}supabase/catalogue.sql`,
  `-- Généré par outils/catalogue_sql.mjs (${cartes.length} cartes). Ne pas modifier à la main.\n\n${instructions.join('\n\n')}\n`,
)
console.log(`${cartes.length} cartes -> supabase/catalogue.sql`)
