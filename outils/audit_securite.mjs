// Audit de sécurité de la base : rejoue toutes les migrations dans un Postgres embarqué (comme outils/tester_sql.mjs,
// avec les droits par défaut de Supabase) et liste ce qu'un visiteur ou un joueur peut atteindre par l'API.
// Usage : node outils/audit_securite.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Comme Supabase : tous les droits par défaut sur ce qui est créé dans public
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`)
for (const f of readdirSync(`${racine}supabase/migrations`).sort()) await db.exec(readFileSync(`${racine}supabase/migrations/${f}`, 'utf8'))

const q = async (sql) => (await db.query(sql)).rows
let alertes = 0
const titre = (t) => console.log(`\n=== ${t}`)
const alerte = (t) => {
  alertes++
  console.log(`  ⚠ ${t}`)
}

titre('Tables de public : RLS et droits des rôles anon et authenticated')
for (const t of await q(`
  select c.relname as nom, c.relrowsecurity as rls,
         has_table_privilege('anon', c.oid, 'select') as anon_lit, has_table_privilege('anon', c.oid, 'insert,update,delete') as anon_ecrit,
         has_table_privilege('authenticated', c.oid, 'select') as auth_lit,
         has_table_privilege('authenticated', c.oid, 'insert') as auth_ins, has_table_privilege('authenticated', c.oid, 'update') as auth_maj,
         has_table_privilege('authenticated', c.oid, 'delete') as auth_sup,
         (select string_agg(p.polname || ' [' || p.polcmd::text || '] ' || coalesce(pg_get_expr(p.polqual, p.polrelid), 'true'), ' | ')
            from pg_policy p where p.polrelid = c.oid) as politiques
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' order by 1`)) {
  const ecrit = t.auth_ins || t.auth_maj || t.auth_sup
  const ligne = `${t.nom.padEnd(22)} RLS=${t.rls ? 'oui' : 'NON'} anon:${t.anon_lit ? 'lit' : '-'}${t.anon_ecrit ? '+écrit' : ''} joueur:${t.auth_lit ? 'lit' : '-'}${ecrit ? `+écrit(${[t.auth_ins && 'ins', t.auth_maj && 'maj', t.auth_sup && 'sup'].filter(Boolean).join(',')})` : ''}`
  console.log(`  ${ligne}\n      politiques : ${t.politiques ?? 'aucune'}`)
  if (!t.rls && (t.anon_lit || t.auth_lit)) alerte(`${t.nom} : sans RLS et lisible par l'API`)
  if (!t.rls && (t.anon_ecrit || ecrit)) alerte(`${t.nom} : sans RLS et modifiable par l'API`)
}

titre('Tables de prive : atteignables ? (le schéma ne doit pas être exposé)')
const usage = await q(`select has_schema_privilege('anon', 'prive', 'usage') as a, has_schema_privilege('authenticated', 'prive', 'usage') as j`)
console.log(`  usage du schéma prive : anon=${usage[0].a} joueur=${usage[0].j}`)
if (usage[0].a || usage[0].j) alerte('le schéma prive est utilisable par anon ou authenticated')

titre('Fonctions de public exécutables par anon (visiteur non connecté)')
for (const f of await q(`
  select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)) {
  alerte(`anon peut appeler ${f.sig}`)
}

titre('Fonctions SECURITY DEFINER sans search_path fixé')
for (const f of await q(`
  select n.nspname || '.' || p.proname as nom from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef and n.nspname in ('public', 'prive')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1`)) {
  alerte(`${f.nom} : SECURITY DEFINER sans search_path`)
}

titre('Fonctions de public appelables par un joueur qui prennent un identifiant de joueur en paramètre')
for (const f of await q(`
  select p.oid::regprocedure::text as sig, pg_get_function_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
     and pg_get_function_arguments(p.oid) ~* 'joueur|_id uuid|p_qui|p_utilisateur' order by 1`)) {
  console.log(`  ? ${f.sig}`)
}

titre('Fonctions de public appelables par un joueur et réservées au serveur (duel_*, push_*) : à vérifier')
const reservees = await q(`
  select p.oid::regprocedure::text as sig, has_function_privilege('authenticated', p.oid, 'execute') as joueur
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'duel\\_%' or p.proname like 'push\\_%' or p.proname like 'jcj\\_%' or p.proname like '%\\_serveur%' or p.proname like 'epreuve\\_%')
   order by 1`)
for (const f of reservees) {
  console.log(`  ${f.joueur ? '⚠ joueur PEUT' : 'ok, joueur ne peut pas'} appeler ${f.sig}`)
  if (f.joueur) alertes++
}

titre('Toutes les fonctions de public appelables par un joueur (SECURITY DEFINER)')
const definer = await q(`
  select p.proname as nom from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') order by 1`)
console.log(`  ${definer.length} fonctions : ${definer.map((f) => f.nom).join(', ')}`)

titre('Publications temps réel (Realtime)')
for (const t of await q(`select pubname, schemaname, tablename from pg_publication_tables order by 1, 3`))
  console.log(`  ${t.pubname} : ${t.schemaname}.${t.tablename}`)

console.log(alertes ? `\n${alertes} alerte(s).` : '\nAucune alerte.')
