// Mesure la place qu'occupe un joueur dans la base : rejoue les migrations et le catalogue dans un Postgres embarqué
// (PGlite), fait ouvrir des dossiers et jouer des duels à un agent, puis relève la taille des tables.
// Usage : node outils/mesurer_empreinte.mjs [dossiers=300] [duels=100]
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const DOSSIERS = Number(process.argv[2] ?? 300)
const DUELS = Number(process.argv[3] ?? 100)
const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`)
for (const f of readdirSync(`${racine}supabase/migrations`).sort()) await db.exec(readFileSync(`${racine}supabase/migrations/${f}`, 'utf8'))
await db.exec(readFileSync(`${racine}supabase/catalogue.sql`, 'utf8'))

const tailles = async () =>
  Object.fromEntries(
    (
      await db.query(`select n.nspname || '.' || c.relname as t, pg_total_relation_size(c.oid)::bigint as o
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'r' and n.nspname in ('public', 'prive')`)
    ).rows.map((r) => [r.t, Number(r.o)]),
  )
const total = async () => Number((await db.query('select pg_database_size(current_database())::bigint as o')).rows[0].o)

const J = '00000000-0000-0000-0000-0000000000e1'
await db.exec(`insert into auth.users (id) values ('${J}')`)
await db.exec(`update public.profils set pseudo = 'Mesure Empreinte' where id = '${J}'`)
await db.exec('vacuum')
const avant = await tailles()
const baseVide = await total()

const en = (sql, params = []) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role authenticated')
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [J])
    return tx.query(sql, params)
  })

for (let i = 0; i < DOSSIERS; i++) {
  await db.exec(`update public.profils set boosters = 1 where id = '${J}'`)
  await en("select public.ouvrir_booster('standard', true)")
}
// Des duels contre l'IA, comme le serveur les enregistre
await db.exec(`update public.profils set equipe = (select array_agg(c) from (select distinct carte_id c from public.exemplaires
  where proprietaire = '${J}' limit 5) x) where id = '${J}'`)
// L'état de partie (main, question posée) que le serveur garde : environ 0,7 Ko par duel
const etat = JSON.stringify({
  niveau: 1,
  langue: 'vf',
  main: [],
  mainIA: ['scp-096'],
  manche: 5,
  pv: 40,
  pvIA: 0,
  bonnes: 4,
  phase: 'resultat',
  question: { texte: 'x'.repeat(160), choix: Array(4).fill('x'.repeat(60)), bonne: 2 },
  debut: Date.now(),
  duree: 20,
})
for (let i = 0; i < DUELS; i++) {
  const d = (await db.query('select public.duel_preparer($1, 1) as d', [J])).rows[0].d
  await db.query('select public.duel_ecrire($1, $2, 0, $3)', [d.id, J, etat])
}
await db.exec('vacuum')
const apres = await tailles()
const lignes = Object.entries(apres)
  .map(([t, o]) => [t, o - (avant[t] ?? 0)])
  .filter(([, d]) => d > 0)
  .sort((a, b) => b[1] - a[1])
const comptes = (
  await db.query(
    `select (select count(*) from public.exemplaires where proprietaire = $1)::int as exemplaires,
  (select count(*) from prive.duels_ia where joueur = $1)::int as duels`,
    [J],
  )
).rows[0]
console.log(`Base vide (catalogue compris) : ${(baseVide / 1e6).toFixed(1)} Mo`)
console.log(`Un agent après ${DOSSIERS} dossiers (${comptes.exemplaires} exemplaires) et ${comptes.duels} duels :`)
for (const [t, d] of lignes) console.log(`  ${t.padEnd(32)} +${(d / 1024).toFixed(0)} Ko`)
const somme = lignes.reduce((s, [, d]) => s + d, 0)
console.log(`  total                            +${(somme / 1024).toFixed(0)} Ko`)
