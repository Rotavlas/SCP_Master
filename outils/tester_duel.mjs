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
const R = await import('./.cache/breche.mjs')
const RC = await import('./.cache/reconfinement.mjs')
const E = await import('./.cache/effets.mjs')

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
  for (const id of ids)
    await admin(`insert into public.exemplaires (proprietaire, carte_id, numero_serie, origine) values ($1, $2, null, 'booster')`, [joueur, id])
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
await test('un autre joueur ne peut ni lire ni répondre au duel', async () => {
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
  const q = await appel('jeton-A', { action: 'jouer', id: duel, carte: equipeA[1] })
  const bonne = (await etatServeur(duel)).question.bonne
  horloge += 30_000
  const r = await appel('jeton-A', { action: 'repondre', id: duel, choix: bonne })
  assert.equal(r.corps.choix, null)
  assert.equal(r.corps.degatsInfliges, 0)
  // 20 s, ou 12 si la carte adverse est temporelle
  assert.equal(r.corps.temps, q.corps.duree)
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
await test('au-delà de 10 duels récompensés par jour, plus de gains', async () => {
  await admin(`insert into prive.duels_ia (joueur, niveau, debut, fin, credits) select $1, 1, now(), now(), 40 from generate_series(1, 10)`, [B])
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
await test("CORS : seule l'origine du jeu est autorisée", async () => {
  const r = await traiter(new Request(`${URL_SUPABASE}/functions/v1/duel`, { method: 'OPTIONS', headers: { Origin: 'https://pirate.example' } }), env)
  assert.equal(r.status, 204)
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), SITE)
})

console.log('Brèche de confinement : règles')
const carteTest = (k, atk, def, extra = {}) => ({ id: `t-${k}-${atk}-${def}`, k, nm: 'Test', ra: 1, p: 1, atk, def, ...extra })
const coup = (carte, cible = 0, juste = true) => ({ carte, cible, juste })
const neuf = () => R.campNeuf()
const I = R.INTEGRITE_CELLULE
await test('chaque type a son rôle', async () => {
  assert.deepEqual(
    ['s', 'g', 'c', 'n', 'd', 'f', 'p', 'e', 'l', 'o'].map((k) => R.role({ k })),
    ['attaque', 'attaque', 'attaque', 'attaque', 'attaque', 'defense', 'defense', 'defense', 'fortification', 'protocole'],
  )
  assert.equal(R.role({ k: 'p', id: 'entite:scarlet-king' }), 'attaque', 'les grandes entités font brèche')
})
await test('une brèche frappe la cellule visée, plus fort pour un Keter', async () => {
  const safe = R.resoudre(neuf(), neuf(), coup(carteTest('s', 50, 0, { c: 'safe' }), 1), coup(carteTest('l', 0, 0)))
  const keter = R.resoudre(neuf(), neuf(), coup(carteTest('s', 50, 0, { c: 'keter' }), 1), coup(carteTest('l', 0, 0)))
  assert.equal(safe.ia.cellules[1], I - 45)
  assert.equal(keter.ia.cellules[1], I - 60)
  assert.equal(safe.ia.cellules[0], I, 'les autres cellules ne bougent pas')
})
await test("une mauvaise réponse ne donne que la moitié de l'effet", async () => {
  const r = R.resoudre(neuf(), neuf(), coup(carteTest('s', 40, 0), 0, false), coup(carteTest('l', 0, 0)))
  assert.equal(r.ia.cellules[0], I - 20)
})
await test('une garde absorbe, une FIM riposte avec ce qui reste', async () => {
  const r = R.resoudre(neuf(), neuf(), coup(carteTest('s', 30, 0), 2), coup(carteTest('f', 0, 50), 2))
  assert.equal(r.ia.cellules[2], I, 'garde plus forte que la brèche')
  assert.equal(r.joueur.cellules[2], I - 10, 'riposte : (50 − 30) / 2')
})
await test("le personnel répare la cellule qu'il garde", async () => {
  const camp = { cellules: [30, I, I], ultime: false }
  const r = R.resoudre(neuf(), camp, coup(carteTest('s', 20, 0), 1), coup(carteTest('p', 0, 40), 0))
  assert.equal(r.ia.cellules[0], 40)
})
await test("une FIM reconfine un SCP qu'elle a confiné dans le wiki", async () => {
  const scp = carteTest('s', 99, 0, { c: 'keter', num: 'SCP-682' })
  const fim = carteTest('f', 0, 10, { lie: ['SCP-096', 'SCP-682'] })
  const r = R.resoudre(neuf(), neuf(), coup(scp, 0), coup(fim, 0))
  assert.equal(r.ia.cellules[0], I)
  assert.ok(r.evenements.some((e) => e.type === 'reconfinement'))
})
await test('un Site ouvre une quatrième cellule, pas une cinquième', async () => {
  const r = R.resoudre(neuf(), neuf(), coup(carteTest('l', 0, 50)), coup(carteTest('l', 0, 50)))
  assert.deepEqual(r.joueur.cellules, [I, I, I, 30])
  const plein = { cellules: [10, I, I, I], ultime: false }
  assert.equal(R.resoudre(plein, neuf(), coup(carteTest('l', 0, 50)), coup(carteTest('l', 0, 0))).joueur.cellules.length, 4)
})
await test('un Protocole affaiblit de moitié la carte adverse', async () => {
  const r = R.resoudre(neuf(), neuf(), coup(carteTest('o', 0, 0)), coup(carteTest('s', 40, 0), 0))
  assert.equal(r.joueur.cellules[0], I - 20)
})
await test('une cellule tombée ne se vise plus : la brèche va sur la plus abîmée', async () => {
  const camp = { cellules: [0, 25, 50], ultime: false }
  const r = R.resoudre(neuf(), camp, coup(carteTest('s', 10, 0), 0), coup(carteTest('l', 0, 0)))
  assert.deepEqual(r.ia.cellules.slice(0, 3), [0, 15, 50])
})
await test("l'ultime d'une Mythique ignore la garde, une seule fois", async () => {
  const mythique = carteTest('s', 40, 0, { ra: 5 })
  const r = R.resoudre(neuf(), neuf(), coup(mythique, 0), coup(carteTest('f', 0, 90), 0))
  assert.equal(r.ia.cellules[0], I - 60, '40 × 1,5 sans garde')
  assert.equal(r.joueur.ultime, true)
  const encore = R.resoudre(r.joueur, neuf(), coup(mythique, 0), coup(carteTest('l', 0, 0)))
  assert.equal(encore.ia.cellules[0], I - 40)
})
await test("initiative : juste et en moins de 7 s, le plus rapide l'emporte", async () => {
  assert.equal(R.initiative({ juste: true, temps: 3 }, { juste: true, temps: 5 }), 'joueur')
  assert.equal(R.initiative({ juste: true, temps: 6 }, { juste: true, temps: 2 }), 'ia')
  assert.equal(R.initiative({ juste: true, temps: 9 }, { juste: false, temps: 1 }), null)
})
await test("avec l'initiative, l'IA garde la cellule que le joueur attaque", async () => {
  const scp = carteTest('s', 50, 0)
  const main = [carteTest('f', 0, 60), carteTest('s', 30, 0)]
  const c = R.choisirIA(main, neuf(), neuf(), { carte: scp, cible: 2 }, 1)
  assert.equal(c.carte.k, 'f')
  assert.equal(c.cible, 2)
})

console.log('Brèche de confinement : serveur')
await admin(`update public.profils set langue = 'vo' where id = $1`, [B])
await admin('delete from prive.duels_ia where joueur = $1', [B])
await test("la partie s'ouvre sans montrer la main de l'IA", async () => {
  const r = await appel('jeton-B', { action: 'breche_debuter', niveau: 1 })
  assert.equal(r.statut, 200, r.texte)
  assert.equal(r.corps.cartesIA, 5)
  assert.deepEqual(r.corps.joueur.cellules, [80, 80, 80])
  assert.ok(!/mainIA/.test(r.texte), r.texte)
})
await test('les actions classiques refusent une Brèche, et inversement', async () => {
  const d = (await appel('jeton-B', { action: 'breche_debuter', niveau: 1 })).corps
  assert.equal((await appel('jeton-B', { action: 'jouer', id: d.id, carte: d.main[0] })).statut, 404)
  const classique = (await appel('jeton-B', { action: 'debuter', niveau: 1 })).corps
  assert.equal((await appel('jeton-B', { action: 'breche_jouer', id: classique.id, carte: classique.main[0] })).statut, 404)
})
await test('une partie complète : la question porte sur sa carte, le serveur résout et récompense', async () => {
  const d = (await appel('jeton-B', { action: 'breche_debuter', niveau: 1 })).corps
  let r
  for (const carte of d.main) {
    const q = await appel('jeton-B', { action: 'breche_jouer', id: d.id, carte, cible: 0 })
    assert.equal(q.statut, 200, q.texte)
    assert.ok(!/"bonne"|"coupIA"|"mainIA"/.test(q.texte), "ni la réponse ni la carte de l'IA")
    const etat = await etatServeur(d.id)
    horloge += 2000
    r = await appel('jeton-B', { action: 'breche_repondre', id: d.id, choix: etat.question.bonne })
    assert.equal(r.statut, 200, r.texte)
    assert.equal(r.corps.choix, r.corps.bonne)
    // Juste en 2 s : l'initiative, sauf si l'IA a été plus rapide
    if (!r.corps.fin && r.corps.initiative === 'joueur') assert.ok(r.corps.revele, "avec l'initiative, la carte de l'IA est montrée")
    if (r.corps.fin) break
  }
  assert.ok(r.corps.fin, 'la partie se termine')
  const j = r.corps.joueur.cellules.reduce((a, b) => a + b, 0)
  const ia = r.corps.ia.cellules.reduce((a, b) => a + b, 0)
  const attendu = r.corps.ia.cellules.every((x) => x <= 0) ? 'victoire' : j > ia ? 'victoire' : j < ia ? 'defaite' : 'nul'
  assert.equal(r.corps.fin.issue, attendu)
  assert.equal((await admin('select bonnes from prive.duels_ia where id = $1', [d.id])).rows[0].bonnes, r.corps.bonnes)
})
await test("avec l'initiative, la carte montrée est bien celle que l'IA joue", async () => {
  for (let essai = 0; essai < 8; essai++) {
    const d = (await appel('jeton-B', { action: 'breche_debuter', niveau: 1 })).corps
    await appel('jeton-B', { action: 'breche_jouer', id: d.id, carte: d.main[0], cible: 0 })
    horloge += 1000
    const r = await appel('jeton-B', { action: 'breche_repondre', id: d.id, choix: (await etatServeur(d.id)).question.bonne })
    if (r.corps.initiative !== 'joueur') continue
    const montre = r.corps.revele.carte
    await appel('jeton-B', { action: 'breche_jouer', id: d.id, carte: d.main[1], cible: 0 })
    horloge += 1000
    const r2 = await appel('jeton-B', { action: 'breche_repondre', id: d.id, choix: 0 })
    assert.equal(r2.corps.coupIA.carte, montre)
    return
  }
  assert.fail("l'initiative n'a jamais été prise en 8 parties")
})

console.log('Reconfinement : effets et règles')
const carteR = (k, atk, def, extra = {}) => ({ id: `r-${k}-${atk}-${def}`, k, nm: 'Test', ra: 1, p: 1, atk, def, ...extra })
await test('les effets viennent du lore : signatures, puis familles de tags', async () => {
  assert.equal(E.effetDe({ id: 'scp-173', t: ['sculpture'] }).alteration, 'clignement')
  assert.equal(E.effetDe({ id: 'scp-x', t: ['humanoid', 'memetic'] }).alteration, 'memetique')
  assert.equal(E.effetDe({ id: 'scp-x', t: ['hostile'] }).force, 1.5)
  assert.equal(E.effetDe({ id: 'scp-x', t: ['humanoid'] }).id, 'aucun')
})
await test('une part sensible des SCP a un effet', async () => {
  const scp = JSON.parse(readFileSync(`${racine}public/data/cards.json`, 'utf8')).cartes.filter((c) => c.k === 's')
  const avec = scp.filter((c) => E.effetDe(c).id !== 'aucun').length
  assert.ok(avec / scp.length > 0.4, `${avec}/${scp.length}`)
})
await test('anomalies et soutiens', async () => {
  assert.equal(RC.nature({ k: 's', id: 'scp-1' }), 'anomalie')
  assert.equal(RC.nature({ k: 'p', id: 'entite:scarlet-king' }), 'anomalie')
  assert.equal(RC.nature({ k: 'f', id: 'fim:x' }), 'soutien')
})
await test('un Protocole neutralise l’effet et divise la brèche', async () => {
  const a = carteR('s', 60, 0, { id: 'scp-x', t: ['hostile'] })
  const sans = RC.preparerReconfinement(a, RC.campReco(), null)
  const avec = RC.preparerReconfinement(a, RC.campReco(), carteR('o', 0, 0))
  assert.equal(RC.degatsAnomalie(a, sans, { reconfinee: false, temps: 5 }), 45)
  assert.equal(RC.degatsAnomalie(a, avec, { reconfinee: false, temps: 5 }), 15)
})
await test('expertise : plus de temps, et l’altération est dissipée', async () => {
  const a = carteR('s', 40, 0, { id: 'scp-x', t: ['temporal'] })
  assert.equal(RC.preparerReconfinement(a, RC.campReco(), null).duree, 12)
  const r = RC.preparerReconfinement(a, RC.campReco(), carteR('p', 0, 30))
  assert.equal(r.duree, 28)
  assert.equal(r.alteree, false)
})
await test('une FIM reconfine d’office un SCP qu’elle a confiné', async () => {
  const a = carteR('s', 40, 0, { id: 'scp-682', num: 'SCP-682' })
  const r = RC.preparerReconfinement(a, RC.campReco(), carteR('f', 0, 30, { lie: ['SCP-682'] }))
  assert.equal(r.auto, 'reussite')
})
await test('SCP-173 frappe plus fort quand on tarde, SCP-682 inflige même reconfiné', async () => {
  const s173 = carteR('s', 50, 0, { id: 'scp-173' })
  const r = RC.preparerReconfinement(s173, RC.campReco(), null)
  assert.ok(RC.degatsAnomalie(s173, r, { reconfinee: false, temps: 18 }) > RC.degatsAnomalie(s173, r, { reconfinee: false, temps: 2 }))
  const s682 = carteR('s', 50, 0, { id: 'scp-682' })
  assert.equal(RC.degatsAnomalie(s682, RC.preparerReconfinement(s682, RC.campReco(), null), { reconfinee: true, temps: 3 }), Math.round(50 * 0.5 * 1.3 * 0.6))
})
await test('SCP-096 : l’avoir regardé triple une brèche', async () => {
  const s096 = carteR('s', 40, 0, { id: 'scp-096' })
  const r = RC.preparerReconfinement(s096, RC.campReco(), null)
  assert.equal(RC.degatsAnomalie(s096, r, { reconfinee: false, temps: 3, regarde: true }), 60)
  assert.equal(RC.degatsAnomalie(s096, r, { reconfinee: false, temps: 3 }), 20)
})
await test('la Manifestation suit la Mythique de l’équipe, sinon le Protocole d’urgence', async () => {
  assert.equal(RC.manifestationDe([carteR('s', 1, 1), { ...carteR('p', 1, 1), id: 'entite:scarlet-king', ra: 5 }]).id, 'chaines')
  assert.equal(RC.manifestationDe([carteR('s', 1, 1)]).id, 'urgence')
  const camps = { joueur: RC.campReco(), ia: RC.campReco() }
  const mains = { joueur: ['a'], ia: ['x', 'y', 'z'] }
  RC.manifester(RC.manifestationDe([{ ...carteR('p', 1, 1), id: 'entite:scarlet-king', ra: 5 }]), 'joueur', camps, mains)
  assert.equal(mains.ia.length, 1, 'deux cartes enchaînées')
  assert.equal(camps.joueur.manifeste, true)
})

console.log('Reconfinement : serveur')
await admin('delete from prive.duels_ia where joueur = $1', [B])
await test('une partie complète, arbitrée et récompensée par le serveur', async () => {
  const d = (await appel('jeton-B', { action: 'reco_debuter', niveau: 1 })).corps
  assert.ok(d.id, JSON.stringify(d))
  assert.equal(d.joueur.integrite, 100)
  assert.ok(!('mainIA' in d && d.mainIA), 'la main de l’IA reste cachée')
  let fin = null
  for (const carte of d.main) {
    const j = await appel('jeton-B', { action: 'reco_jouer', id: d.id, carte })
    assert.equal(j.statut, 200, j.texte)
    assert.ok(j.corps.carteIA, 'la carte de l’IA est montrée')
    let r = j.corps.resultat
    if (j.corps.question) {
      assert.ok(!/"bonne"/.test(j.texte), 'la bonne réponse reste sur le serveur')
      const etat = await etatServeur(d.id)
      assert.ok(!j.corps.question.retirees.includes(etat.question.bonne), 'on ne retire jamais la bonne réponse')
      horloge += 2000
      r = (await appel('jeton-B', { action: 'reco_repondre', id: d.id, choix: etat.question.bonne })).corps
      assert.equal(r.choix, r.bonne)
    }
    assert.ok(r && Array.isArray(r.evenements), JSON.stringify(r))
    if (r.fin) {
      fin = r.fin
      break
    }
  }
  assert.ok(fin, 'la partie se termine')
  assert.ok(['victoire', 'defaite', 'nul'].includes(fin.issue))
})
await test('une réponse retirée par la FIM ne compte pas', async () => {
  // Réponse invalide : comme un temps écoulé
  const d = (await appel('jeton-B', { action: 'reco_debuter', niveau: 1 })).corps
  for (const carte of d.main) {
    const j = await appel('jeton-B', { action: 'reco_jouer', id: d.id, carte })
    if (!j.corps.question) {
      if (j.corps.resultat?.fin) break
      continue
    }
    horloge += 1000
    const r = await appel('jeton-B', { action: 'reco_repondre', id: d.id, choix: 7 })
    assert.equal(r.corps.choix, null)
    return
  }
})
await test('pas de Manifestation avant que la jauge soit pleine', async () => {
  const d = (await appel('jeton-B', { action: 'reco_debuter', niveau: 1 })).corps
  const r = await appel('jeton-B', { action: 'reco_manifester', id: d.id })
  assert.equal(r.statut, 409)
})
await test('la Manifestation se déclenche une fois la jauge pleine', async () => {
  const d = (await appel('jeton-B', { action: 'reco_debuter', niveau: 1 })).corps
  const etat = await etatServeur(d.id)
  etat.joueur.manifestation = 100
  await admin('update prive.duels_ia set etat = $2 where id = $1', [d.id, JSON.stringify(etat)])
  const r = await appel('jeton-B', { action: 'reco_manifester', id: d.id })
  assert.equal(r.statut, 200, r.texte)
  assert.equal(r.corps.joueur.manifeste, true)
  assert.equal(r.corps.joueur.manifestation, 0)
  assert.equal((await appel('jeton-B', { action: 'reco_manifester', id: d.id })).statut, 409, 'une seule fois')
})

console.log('Duels entre joueurs')
const C = '00000000-0000-0000-0000-00000000000c'
await db.exec(`insert into auth.users (id) values ('${C}')`)
JETONS['jeton-C'] = C
await admin(`update public.profils set pseudo = 'Alpha', langue = 'vo' where id = '${A}'`)
await admin(`update public.profils set pseudo = 'Bravo', langue = 'vo' where id = '${B}'`)
await admin(`update public.profils set pseudo = 'Charlie' where id = '${C}'`)
const secretJcj = async (id) => (await admin('select etat from prive.duels_jcj_secret where duel = $1', [id])).rows[0].etat
const ligneJcj = async (id) => (await admin('select statut, etat, issue, classe from public.duels_jcj where id = $1', [id])).rows[0]
const elo = async (j) => (await admin('select elo from public.profils where id = $1', [j])).rows[0].elo

/** Une manche complète : les deux joueurs jouent leur première carte et répondent (juste ou non). */
async function mancheJcj(id, justeA, justeB, delaiA = 2, delaiB = 4) {
  const a = (await appel('jeton-A', { action: 'jcj_etat', id })).corps
  const b = (await appel('jeton-B', { action: 'jcj_etat', id })).corps
  assert.equal((await appel('jeton-A', { action: 'jcj_jouer', id, carte: a.main[0] })).statut, 200)
  const q = await appel('jeton-B', { action: 'jcj_jouer', id, carte: b.main[0] })
  assert.equal(q.statut, 200, q.texte)
  const bonne = (await secretJcj(id)).question.bonne
  const n = q.corps.etat.question.options.length
  horloge += delaiA * 1000
  await appel('jeton-A', { action: 'jcj_repondre', id, choix: justeA ? bonne : (bonne + 1) % n })
  horloge += (delaiB - delaiA) * 1000
  const r = await appel('jeton-B', { action: 'jcj_repondre', id, choix: justeB ? bonne : (bonne + 1) % n })
  assert.equal(r.statut, 200, r.texte)
  return r.corps
}

let jcj
await test('la file classée apparie deux joueurs et ouvre le duel', async () => {
  const a = await appel('jeton-A', { action: 'jcj_file' })
  assert.equal(a.statut, 200, a.texte)
  assert.equal(a.corps.attente, true)
  const b = await appel('jeton-B', { action: 'jcj_file' })
  assert.equal(b.statut, 200, b.texte)
  jcj = b.corps.duel.id
  assert.equal(b.corps.duel.cote, 'b')
  assert.equal(b.corps.duel.classe, true)
  assert.equal(b.corps.duel.adversaire.pseudo, 'Alpha')
  assert.equal(b.corps.duel.etat.phase, 'choix')
  assert.equal(b.corps.duel.main.length, 5)
  const a2 = await appel('jeton-A', { action: 'jcj_file' })
  assert.equal(a2.corps.duel.id, jcj, 'A retrouve le duel en relançant la file')
  assert.deepEqual(a2.corps.duel.main, equipeA)
})
await test('un troisième joueur ne peut ni lire ni jouer le duel', async () => {
  assert.equal((await appel('jeton-C', { action: 'jcj_etat', id: jcj })).statut, 404)
  assert.equal((await appel('jeton-C', { action: 'jcj_jouer', id: jcj, carte: equipeA[0] })).statut, 404)
})
await test("pas de question tant que les deux n'ont pas choisi, et jamais la bonne réponse", async () => {
  const a = await appel('jeton-A', { action: 'jcj_jouer', id: jcj, carte: equipeA[0] })
  assert.equal(a.corps.etat.phase, 'choix')
  assert.equal(a.corps.etat.choisi.a, true)
  assert.equal((await appel('jeton-A', { action: 'jcj_jouer', id: jcj, carte: equipeA[1] })).statut, 409, 'une seule carte par manche')
  const mainB = (await appel('jeton-B', { action: 'jcj_etat', id: jcj })).corps.main
  assert.equal(
    (await appel('jeton-B', { action: 'jcj_jouer', id: jcj, carte: equipeA[0] === mainB[0] ? 'scp-000' : equipeA[0] })).statut,
    400,
    'carte hors de sa main',
  )
  const b = await appel('jeton-B', { action: 'jcj_jouer', id: jcj, carte: mainB[0] })
  assert.equal(b.corps.etat.phase, 'question')
  assert.ok(!b.texte.includes('"bonne"'), 'la bonne réponse ne quitte pas le serveur')
  assert.ok(!JSON.stringify((await ligneJcj(jcj)).etat).includes('"bonne"'), "ni l'état diffusé aux joueurs")
  assert.ok(!JSON.stringify((await ligneJcj(jcj)).etat).includes(mainB[0]), 'la carte de B reste cachée pendant la question')
})
await test('les deux répondent : le serveur corrige et applique les dégâts', async () => {
  const bonne = (await secretJcj(jcj)).question.bonne
  horloge += 2000
  const a = await appel('jeton-A', { action: 'jcj_repondre', id: jcj, choix: bonne })
  assert.equal(a.corps.etat.repondu.a, true)
  assert.equal((await appel('jeton-A', { action: 'jcj_repondre', id: jcj, choix: bonne })).statut, 409, 'une seule réponse')
  horloge += 3000
  const b = await appel('jeton-B', { action: 'jcj_repondre', id: jcj, choix: (bonne + 1) % 4 })
  const d = b.corps.etat.dernier
  assert.equal(d.bonne, bonne)
  assert.equal(d.choix.a, bonne)
  assert.ok(d.degats.b > 0, 'B prend des dégâts')
  assert.equal(d.degats.a, 0, 'A ne prend rien')
  assert.equal(b.corps.etat.pv.b, 100 - d.degats.b)
  assert.equal(b.corps.etat.manche, 2)
  assert.equal(b.corps.etat.phase, 'choix')
  assert.equal(b.corps.main.length, 4, 'la carte jouée a quitté la main')
})
await test("délai de choix dépassé : la carte est jouée d'office", async () => {
  horloge += 30_000
  const r = await appel('jeton-A', { action: 'jcj_etat', id: jcj })
  assert.equal(r.corps.etat.phase, 'question')
  assert.equal(r.corps.etat.choisi.a && r.corps.etat.choisi.b, true)
})
await test('délai de réponse dépassé : personne ne frappe', async () => {
  const pv = (await ligneJcj(jcj)).etat.pv
  horloge += 30_000
  const r = await appel('jeton-B', { action: 'jcj_etat', id: jcj })
  assert.equal(r.corps.etat.manche, 3)
  assert.deepEqual(r.corps.etat.pv, pv)
  assert.deepEqual(r.corps.etat.dernier.choix, { a: null, b: null })
})
await test("fin du duel : l'issue vient des points de vie, Elo et gains appliqués", async () => {
  const [eloA, eloB] = [await elo(A), await elo(B)]
  let r
  // A répond juste, B faux : B peut tomber à 0 avant la 5e manche
  for (let i = 0; i < 3 && r?.etat.phase !== 'fin'; i++) r = await mancheJcj(jcj, true, false)
  assert.equal(r.etat.phase, 'fin')
  assert.ok(r.etat.pv.a > r.etat.pv.b)
  assert.equal(r.etat.fin.issue, 'a')
  const l = await ligneJcj(jcj)
  assert.equal(l.statut, 'termine')
  assert.equal(l.issue, 'a')
  assert.equal(await elo(A), eloA + 16)
  assert.equal(await elo(B), eloB - 16)
  assert.equal(r.gains.credits, 25, 'B, perdant, reçoit 25 crédits')
  assert.ok(r.profil, 'le profil à jour revient au joueur qui a terminé')
  const a = (await appel('jeton-A', { action: 'jcj_etat', id: jcj })).corps
  assert.deepEqual([a.gains.elo, a.gains.credits], [16, 120])
  assert.equal((await appel('jeton-A', { action: 'jcj_jouer', id: jcj, carte: equipeA[4] })).corps.statut, 'termine', 'plus rien ne se joue')
})
await test("abandonner donne la victoire à l'adversaire", async () => {
  await appel('jeton-A', { action: 'jcj_file' })
  const id = (await appel('jeton-B', { action: 'jcj_file' })).corps.duel.id
  const r = await appel('jeton-B', { action: 'jcj_abandonner', id })
  assert.equal(r.corps.etat.fin.issue, 'a')
  assert.equal(r.corps.etat.fin.abandon, 'b')
  assert.equal((await ligneJcj(id)).statut, 'termine')
})
await test('défi amical entre amis : sans Elo', async () => {
  await admin(`insert into prive.amities (de, vers, statut) values ('${A}', '${B}', 'ami')`)
  assert.equal((await appel('jeton-A', { action: 'jcj_defier', pseudo: 'Charlie' })).statut, 409, 'pas ami avec Charlie')
  const { id } = (await appel('jeton-A', { action: 'jcj_defier', pseudo: 'Bravo' })).corps
  const r = await appel('jeton-B', { action: 'jcj_repondre_defi', id, accepter: true })
  assert.equal(r.statut, 200, r.texte)
  assert.equal(r.corps.duel.classe, false)
  const [eloA, eloB] = [await elo(A), await elo(B)]
  let fin
  for (let i = 0; i < 5 && !fin?.etat.fin; i++) fin = await mancheJcj(id, true, false)
  assert.equal(fin.etat.phase, 'fin')
  assert.deepEqual([await elo(A), await elo(B)], [eloA, eloB])
  assert.deepEqual([fin.gains.credits, fin.gains.elo, fin.gains.xp], [0, 0, 15])
})
await test('défi refusé : annulé', async () => {
  const { id } = (await appel('jeton-A', { action: 'jcj_defier', pseudo: 'Bravo' })).corps
  assert.equal((await appel('jeton-B', { action: 'jcj_repondre_defi', id, accepter: false })).corps.refuse, true)
  assert.equal((await ligneJcj(id)).statut, 'annule')
})
await test('les questions portent tour à tour sur la carte de chaque joueur', async () => {
  await appel('jeton-A', { action: 'jcj_file' })
  const id = (await appel('jeton-B', { action: 'jcj_file' })).corps.duel.id
  const sujets = []
  for (let m = 0; m < 5; m++) {
    const a = (await appel('jeton-A', { action: 'jcj_etat', id })).corps
    const b = (await appel('jeton-B', { action: 'jcj_etat', id })).corps
    await appel('jeton-A', { action: 'jcj_jouer', id, carte: a.main[0] })
    const q = (await appel('jeton-B', { action: 'jcj_jouer', id, carte: b.main[0] })).corps
    sujets.push(q.etat.question.surCarteDe)
    // Personne ne répond : pas de dégâts, le duel va jusqu'à la 5e manche
    horloge += 30_000
  }
  assert.deepEqual(sujets, sujets[0] === 'a' ? ['a', 'b', 'a', 'b', 'a'] : ['b', 'a', 'b', 'a', 'b'])
  await appel('jeton-A', { action: 'jcj_etat', id })
})
await test('deux joueurs qui ouvrent le même duel en préparation au même instant : aucune erreur', async () => {
  const id = (await admin(`insert into public.duels_jcj (joueur_a, joueur_b, classe, statut) values ($1, $2, false, 'preparation') returning id`, [A, B]))
    .rows[0].id
  const [a, b] = await Promise.all([appel('jeton-A', { action: 'jcj_etat', id }), appel('jeton-B', { action: 'jcj_etat', id })])
  assert.equal(a.statut, 200, a.texte)
  assert.equal(b.statut, 200, b.texte)
  assert.equal(a.corps.etat.phase, 'choix')
  assert.equal(b.corps.etat.phase, 'choix')
  assert.deepEqual(a.corps.etat.pv, b.corps.etat.pv)
  await appel('jeton-A', { action: 'jcj_abandonner', id })
})
await test('quitter la file', async () => {
  await appel('jeton-A', { action: 'jcj_file' })
  assert.equal((await appel('jeton-A', { action: 'jcj_quitter' })).corps.ok, true)
  assert.equal((await admin('select count(*)::int as n from prive.file_jcj')).rows[0].n, 0)
})

console.log(`\n${reussis} tests réussis${process.exitCode ? ', des échecs' : ''}.`)
