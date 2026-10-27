// Génère supabase/catalogue.sql à partir de public/data/cards.json : le serveur a besoin
// de l'identifiant, du type et de la rareté de chaque carte pour tirer les boosters.
// Une instruction par couple type × rareté, pour un fichier assez léger à coller dans le SQL Editor.
// Usage : npm run catalogue-sql   (à relancer après chaque `npm run cartes`, puis à exécuter sur la base)
//         npm run catalogue-sql -- <ancien cards.json>   (n'écrit dans supabase/catalogue_maj.sql que les
//         cartes nouvelles ou dont le type ou la rareté ont changé, bien plus court à coller)
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const { cartes } = JSON.parse(readFileSync(`${racine}public/data/cards.json`, 'utf8'))
const ancien = process.argv[2] ? new Map(JSON.parse(readFileSync(process.argv[2], 'utf8')).cartes.map((c) => [c.id, c])) : null
const retenues = ancien ? cartes.filter((c) => ancien.get(c.id)?.k !== c.k || ancien.get(c.id)?.ra !== c.ra) : cartes

const groupes = new Map()
for (const c of retenues) {
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
const fichier = ancien ? 'catalogue_maj.sql' : 'catalogue.sql'
writeFileSync(
  `${racine}supabase/${fichier}`,
  `-- Généré par outils/catalogue_sql.mjs (${retenues.length} cartes${ancien ? ' nouvelles ou modifiées' : ''}). Ne pas modifier à la main.\n\n${instructions.join('\n\n')}\n`,
)
console.log(`${retenues.length} cartes -> supabase/${fichier}`)
