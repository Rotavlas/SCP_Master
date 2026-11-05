// Vérifie les chances réelles des variantes : rejoue des centaines de milliers de tirages avec les vraies fonctions SQL
// (Postgres embarqué, comme outils/tester_sql.mjs) et les compare à ce que le jeu affiche (src/engine/variantes.ts,
// src/engine/boosters.ts). Usage : node outils/verifier_variantes.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`)
for (const f of readdirSync(`${racine}supabase/migrations`).sort()) await db.exec(readFileSync(`${racine}supabase/migrations/${f}`, 'utf8'))

// Ce que le jeu annonce
const src = readFileSync(`${racine}src/engine/variantes.ts`, 'utf8')
const annonce = Object.fromEntries([...src.matchAll(/id: '(\w+)',[^}]*?chance: ([\d.]+)/gs)].map((m) => [m[1], Number(m[2])]))
const bonusClient = Object.fromEntries(
  [...readFileSync(`${racine}src/engine/boosters.ts`, 'utf8').matchAll(/id: '(\w+)',[\s\S]*?bonusVariante: ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]),
)

const N = 400_000
const pct = (x) => `${(x * 100).toFixed(3)} %`
let ecarts = 0

const types = (await db.query('select id, bonus_variante::float8 as b from prive.types_boosters order by prix')).rows
console.log('Bonus de variante par dossier (serveur / affiché)')
for (const t of types) {
  const ok = bonusClient[t.id] === t.b
  if (!ok) ecarts++
  console.log(`  ${t.id.padEnd(10)} ×${t.b}  /  ×${bonusClient[t.id] ?? '—'}  ${ok ? 'ok' : 'ÉCART'}`)
}

async function frequences(sql) {
  const r = (await db.query(`select v, count(*)::int as n from (select ${sql} as v from generate_series(1, ${N})) x group by v`)).rows
  return Object.fromEntries(r.map((x) => [x.v, x.n / N]))
}

for (const b of [...new Set(types.map((t) => t.b))]) {
  const f = await frequences(`prive.tirer_variante(${b})`)
  console.log(`\nFiche ordinaire, bonus ×${b} (dossiers ${types.filter((t) => t.b === b).map((t) => t.id).join(', ')})`)
  for (const v of ['holo', 'exp', 'arch', 'breche', 'o5']) {
    const attendu = annonce[v] * b
    const mesure = f[v] ?? 0
    // Tolérance : 4 écarts-types de la loi binomiale
    const tol = 4 * Math.sqrt((attendu * (1 - attendu)) / N)
    const ok = Math.abs(mesure - attendu) <= tol
    if (!ok) ecarts++
    console.log(`  ${v.padEnd(8)} attendu ${pct(attendu).padStart(9)}  mesuré ${pct(mesure).padStart(9)}  ${ok ? 'ok' : 'ÉCART'}`)
  }
  console.log(`  std      mesuré ${pct(f.std ?? 0)}`)
}

const m = await frequences('prive.tirer_variante_mythique(1)')
console.log('\nMythique (dossier standard)')
for (const [v, attendu] of [
  ['negatif', annonce.negatif],
  ['esquisse', annonce.esquisse],
  ['holo', (1 - annonce.negatif - annonce.esquisse) * annonce.holo],
  ['breche', (1 - annonce.negatif - annonce.esquisse) * annonce.breche],
  ['o5', (1 - annonce.negatif - annonce.esquisse) * annonce.o5],
]) {
  const tol = 4 * Math.sqrt((attendu * (1 - attendu)) / N)
  const ok = Math.abs((m[v] ?? 0) - attendu) <= tol
  if (!ok) ecarts++
  console.log(`  ${v.padEnd(8)} attendu ${pct(attendu).padStart(9)}  mesuré ${pct(m[v] ?? 0).padStart(9)}  ${ok ? 'ok' : 'ÉCART'}`)
}

const fu = await frequences('prive.tirer_variante_fusion()')
const total = ['holo', 'exp', 'arch', 'breche', 'o5'].reduce((s, v) => s + annonce[v], 0)
console.log('\nFusion de 5 doublons')
for (const v of ['holo', 'exp', 'arch', 'breche', 'o5']) {
  const attendu = annonce[v] / total
  const tol = 4 * Math.sqrt((attendu * (1 - attendu)) / N)
  const ok = Math.abs((fu[v] ?? 0) - attendu) <= tol
  if (!ok) ecarts++
  console.log(`  ${v.padEnd(8)} attendu ${pct(attendu).padStart(9)}  mesuré ${pct(fu[v] ?? 0).padStart(9)}  ${ok ? 'ok' : 'ÉCART'}`)
}

console.log(ecarts ? `\n${ecarts} écart(s).` : '\nAucun écart : les chances tirées sont celles affichées.')
process.exitCode = ecarts ? 1 : 0
