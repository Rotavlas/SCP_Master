// Teste la fonction Edge « duel » de bout en bout, sans Supabase : la logique regroupée par
// outils/construire_duel.mjs tourne sous Node, les fonctions SQL duel_* dans un Postgres embarqué (PGlite)
// avec toutes les migrations, et un faux fetch joue le rôle de l'authentification, de l'API REST et du site.
// Usage : npm run test-duel
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const { traiter } = await import('./.cache/duel.mjs')

const db = new PGlite()
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`)
for (const f of readdirSync(`${racine}supabase/migrations`).sort()) {
  await db.exec(readFileSync(`${racine}supabase/migrations/${f}`, 'utf8'))
}
await db.exec(readFileSync(`${racine}supabase/catalogue.sql`, 'utf8'))

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}')`)
const JETONS = { 'jeton-A': A, 'jeton-B': B }

// ---------- Faux Supabase et faux site ----------
const URL_SUPABASE = 'https://projet.supabase.co'
const SITE = 'https://jeu.example'
const fichiers = {
  [`${SITE}/data/cards.json`]: readFileSync(`${racine}public/data/cards.json`, 'utf8'),
  [`${SITE}/data/cards.fr.json`]: readFileSync(`${racine}public/data/cards.fr.json`, 'utf8'),
}
const json = (statut, donnees) => new Response(JSON.stringify(donnees), { status: statut, headers: { 'Content-Type': 'application/json' } })

globalThis.fetch = async (url, options = {}) => {
  url = String(url)
  if (fichiers[url]) return new Response(fichiers[url].replace(/^﻿/, ''), { status: 200 })
  const entetes = new Headers(options.headers)
  if (url === `${URL_SUPABASE}/auth/v1/user`) {
    const id = JETONS[entetes.get('Authorization')?.replace('Bearer ', '')]
    return id ? json(200, { id }) : json(401, { message: 'invalid JWT' })
  }
  const rpc = url.match(new RegExp(`^${URL_SUPABASE}/rest/v1/rpc/(\\w+)$`))
  if (rpc) {
    assert.equal(entetes.get('apikey'), 'cle-service', 'les fonctions duel_* sont appelées avec la clé de service')
    const params = JSON.parse(options.body)
    const noms = Object.keys(params)
    const sql = `select public.${rpc[1]}(${noms.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`
    const valeurs = noms.map((n) => (params[n] !== null && typeof params[n] === 'object' ? JSON.stringify(params[n]) : params[n]))
    try {
      const r = await db.transaction(async (tx) => {
        await tx.exec('set local role service_role')
        return tx.query(sql, valeurs)
      })
      return json(200, r.rows[0].r)
    } catch (e) {
      return json(400, { message: e.message })
    }
  }
  throw new Error(`fetch inattendu : ${url}`)
}

let horloge = 1_000_000
const env = { url: URL_SUPABASE, cleService: 'cle-service', site: SITE, origines: [SITE], maintenant: () => horloge }

async function appel(jeton, corps) {
  const req = new Request(`${URL_SUPABASE}/functions/v1/duel`, {
    method: 'POST',
    headers: jeton ? { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Origin: SITE } : { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const r = await traiter(req, env)
  const texte = await r.text()
  return { statut: r.status, corps: JSON.parse(texte), texte, entetes: r.headers }
}
const admin = (sql, params) => db.query(sql, params)
const etatServeur = async (id) => (await admin('select etat from prive.duels_ia where id = $1', [id])).rows[0].etat

let reussis = 0
async function test(nom, f) {
  try {
    await f()
    reussis++
    console.log(`  ok  ${nom}`)
  } catch (e) {
    console.log(`  ÉCHEC  ${nom}\n        ${e.message}`)
    process.exitCode = 1
  }
}

// Une équipe de 5 cartes possédées pour A et B
async function equiper(joueur) {
  const ids = (await admin("select id from public.cartes where k = 's' and ra = 2 order by random() limit 5")).rows.map((r) => r.id)
  for (const id of ids) await admin(`insert into public.exemplaires (proprietaire, carte_id, numero_serie, origine) values ($1, $2, null, 'booster')`, [joueur, id])
  await admin('update public.profils set equipe = $2 where id = $1', [joueur, ids])
  return ids
}

/** Joue une manche ; `bien` : répondre juste (en lisant la réponse dans la base, comme un tricheur ne le peut pas). */
async function manche(jeton, id, carte, bien, delai = 3) {
  const q = await appel(jeton, { action: 'jouer', id, carte })
  assert.equal(q.statut, 200, q.texte)
  const bonne = (await etatServeur(id)).question.bonne
  horloge += delai * 1000
  const choix = bien ? bonne : (bonne + 1) % q.corps.question.options.length
  const r = await appel(jeton, { action: 'repondre', id, choix })
  assert.equal(r.statut, 200, r.texte)
  return { q, r, bonne }
}

console.log('Accès')
await test('sans connexion : refusé', async () => {
  const r = await appel(null, { action: 'debuter', niveau: 1 })
  assert.equal(r.statut, 401)
})
await test('jeton inconnu : refusé', async () => {
  assert.equal((await appel('jeton-faux', { action: 'debuter', niveau: 1 })).statut, 401)
})
await test('les fonctions duel_* sont réservées à la clé de service', async () => {
  for (const sql of [`select public.duel_preparer('${A}', 1)`, `select public.duel_lire(gen_random_uuid(), '${A}')`]) {
    for (const role of ['authenticated', 'anon']) {
      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`)
          await tx.query(sql)
        }),
        /permission denied/,
      )
    }
  }
})
await test("les anciennes fonctions qui croyaient le navigateur n'existent plus", async () => {
  const n = (await admin("select count(*)::int as n from pg_proc where proname in ('debuter_duel', 'terminer_duel')")).rows[0].n
  assert.equal(n, 0)
})

console.log('Préparation')
await test('sans équipe de 5 cartes : refusé', async () => {
  const r = await appel('jeton-A', { action: 'debuter', niveau: 1 })
  assert.equal(r.statut, 409)
  assert.match(r.corps.message, /équipe/)
})
const equipeA = await equiper(A)
await equiper(B)
await test('adversaire au-dessus de son accréditation : refusé', async () => {
  const r = await appel('jeton-A', { action: 'debuter', niveau: 5 })
  assert.equal(r.statut, 409)
  assert.match(r.corps.message, /Accréditation/)
})
await test('adversaire inexistant : refusé', async () => {
  assert.equal((await appel('jeton-A', { action: 'debuter', niveau: 42 })).statut, 400)
})

console.log('Déroulement')
let duel
await test("le duel s'ouvre avec l'équipe enregistrée sur le serveur", async () => {
  const r = await appel('jeton-A', { action: 'debuter', niveau: 1 })
  assert.equal(r.statut, 200, r.texte)
  assert.deepEqual(r.corps.main, equipeA)
  assert.equal(r.corps.cartesIA, 5)
  assert.ok(!('mainIA' in r.corps), "le deck de l'IA reste secret")
  duel = r.corps.id
})
await test("une carte qui n'est pas dans la main est refusée", async () => {
  const r = await appel('jeton-A', { action: 'jouer', id: duel, carte: 'scp-173' })
  assert.equal(r.statut, 400)
})
await test("la question n'envoie ni la bonne réponse ni le choix de l'IA", async () => {
  const r = await appel('jeton-A', { action: 'jouer', id: duel, carte: equipeA[0] })
  assert.equal(r.statut, 200, r.texte)
  assert.equal(r.corps.question.options.length, 4)
  assert.ok(!/"bonne"|"choix"|"carteIA"|"mainIA"/.test(r.texte), r.texte)
})
await test("pas de deuxième question tant qu'on n'a pas répondu", async () => {
  assert.equal((await appel('jeton-A', { action: 'jouer', id: duel, carte: equipeA[1] })).statut, 409)
})
await test("un autre joueur ne peut ni lire ni répondre au duel", async () => {
  assert.equal((await appel('jeton-B', { action: 'repondre', id: duel, choix: 0 })).statut, 404)
})
await test('une bonne réponse inflige des dégâts calculés par le serveur', async () => {
  const bonne = (await etatServeur(duel)).question.bonne
  horloge += 4000
  const r = await appel('jeton-A', { action: 'repondre', id: duel, choix: bonne })
  assert.equal(r.statut, 200, r.texte)
  assert.equal(r.corps.bonne, bonne)
  assert.equal(r.corps.choix, bonne)
  assert.ok(r.corps.degatsInfliges >= 8)
  assert.equal(r.corps.pvIA, 100 - r.corps.degatsInfliges)
  assert.equal(r.corps.temps, 4)
})
await test('répondre deux fois à la même question : refusé', async () => {
  assert.equal((await appel('jeton-A', { action: 'repondre', id: duel, choix: 0 })).statut, 409)
})
await test('une carte déjà jouée ne revient pas', async () => {
  assert.equal((await appel('jeton-A', { action: 'jouer', id: duel, carte: equipeA[0] })).statut, 400)
})
await test('réponse après le délai : comptée comme temps écoulé', async () => {
  await appel('jeton-A', { action: 'jouer', id: duel, carte: equipeA[1] })
  const bonne = (await etatServeur(duel)).question.bonne
  horloge += 30_000
  const r = await appel('jeton-A', { action: 'repondre', id: duel, choix: bonne })
  assert.equal(r.corps.choix, null)
  assert.equal(r.corps.degatsInfliges, 0)
  assert.equal(r.corps.temps, 20)
})
await test('réponse mal formée : comptée comme temps écoulé', async () => {
  await appel('jeton-A', { action: 'jouer', id: duel, carte: equipeA[2] })
  horloge += 2000
  const r = await appel('jeton-A', { action: 'repondre', id: duel, choix: '1; drop table public.profils' })
  assert.equal(r.statut, 200, r.texte)
  assert.equal(r.corps.choix, null)
})

console.log('Fin et récompense')
await test("la récompense découle de l'issue calculée par le serveur", async () => {
  // Nouveau duel, toutes les réponses justes et rapides : l'issue dépend des dégâts, pas d'une déclaration
  const avant = Number((await admin('select credits from public.profils where id = $1', [A])).rows[0].credits)
  const d = (await appel('jeton-A', { action: 'debuter', niveau: 1 })).corps
  let r
  for (const carte of d.main) {
    ;({ r } = await manche('jeton-A', d.id, carte, true, 2))
    if (r.corps.fin) break
  }
  const fin = r.corps.fin
  assert.ok(fin, 'le duel se termine')
  const attendu = r.corps.pv > r.corps.pvIA ? 'victoire' : r.corps.pv < r.corps.pvIA ? 'defaite' : 'nul'
  assert.equal(fin.issue, attendu)
  const credits = { victoire: 40 + r.corps.bonnes * 5, nul: 13, defaite: 10 }[attendu]
  assert.equal(fin.credits, credits)
  assert.equal(Number(fin.profil.credits), avant + credits)
  const ligne = (await admin('select fin, issue, bonnes from prive.duels_ia where id = $1', [d.id])).rows[0]
  assert.ok(ligne.fin)
  assert.equal(ligne.issue, attendu)
  assert.equal((await appel('jeton-A', { action: 'jouer', id: d.id, carte: d.main[0] })).statut, 404, 'duel clos')
})
await test('commencer un duel abandonne le précédent, sans gain', async () => {
  const premier = (await appel('jeton-A', { action: 'debuter', niveau: 1 })).corps
  await appel('jeton-A', { action: 'jouer', id: premier.id, carte: premier.main[0] })
  await appel('jeton-A', { action: 'debuter', niveau: 1 })
  assert.equal((await appel('jeton-A', { action: 'repondre', id: premier.id, choix: 0 })).statut, 404)
  const l = (await admin('select issue, credits from prive.duels_ia where id = $1', [premier.id])).rows[0]
  assert.deepEqual(l, { issue: 'defaite', credits: 0 })
})
await test('au-delà de 30 duels récompensés par jour, plus de gains', async () => {
  await admin(`insert into prive.duels_ia (joueur, niveau, debut, fin, credits) select $1, 1, now(), now(), 40 from generate_series(1, 30)`, [B])
  const d = (await appel('jeton-B', { action: 'debuter', niveau: 1 })).corps
  let r
  for (const carte of d.main) {
    ;({ r } = await manche('jeton-B', d.id, carte, true, 2))
    if (r.corps.fin) break
  }
  assert.equal(r.corps.fin.credits, 0)
})
await test('les questions existent aussi en VF', async () => {
  await admin("update public.profils set langue = 'vf' where id = $1", [B])
  const d = (await appel('jeton-B', { action: 'debuter', niveau: 1 })).corps
  const q = await appel('jeton-B', { action: 'jouer', id: d.id, carte: d.main[0] })
  assert.equal(q.statut, 200, q.texte)
  assert.equal((await etatServeur(d.id)).langue, 'vf')
})
await test('CORS : seule l\'origine du jeu est autorisée', async () => {
  const r = await traiter(new Request(`${URL_SUPABASE}/functions/v1/duel`, { method: 'OPTIONS', headers: { Origin: 'https://pirate.example' } }), env)
  assert.equal(r.status, 204)
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), SITE)
})

console.log(`\n${reussis} tests réussis${process.exitCode ? ', des échecs' : ''}.`)
