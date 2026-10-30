// Teste les migrations Supabase dans un Postgres embarqué (PGlite), sans Docker ni compte Supabase.
// On recrée le strict nécessaire de Supabase : rôles anon/authenticated, auth.users et auth.uid().
// Usage : npm run test-sql
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const racine = fileURLToPath(new URL('..', import.meta.url))
const db = new PGlite()

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- Comme Supabase : tous les droits par défaut sur ce qui est créé dans public, à la migration de les restreindre
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

/** Exécute une requête en tant que joueur connecté (ou anonyme si joueur = null). */
async function en(joueur, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${joueur ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [joueur ?? ''])
    return tx.query(sql, params)
  })
}
const valeur = async (joueur, sql, params) => Object.values((await en(joueur, sql, params)).rows[0])[0]
async function echoue(promesse, message) {
  await assert.rejects(promesse, (e) => {
    assert.match(e.message, message)
    return true
  })
}
const admin = (sql, params) => db.query(sql, params)

console.log('Catalogue et inscription')
await test('le catalogue contient toutes les cartes', async () => {
  const n = (await admin('select count(*)::int as n from public.cartes')).rows[0].n
  assert.equal(n, JSON.parse(readFileSync(`${racine}public/data/cards.json`, 'utf8')).cartes.length)
})
await test("l'inscription crée un profil avec 3 boosters et 200 crédits", async () => {
  const etat = await valeur(A, 'select public.mon_etat()')
  assert.equal(etat.profil.boosters, 3)
  assert.equal(etat.profil.credits, 200)
  assert.deepEqual(etat.collection, [])
})
await test('un visiteur non connecté ne peut rien appeler', async () => {
  await echoue(en(null, 'select public.mon_etat()'), /permission denied/)
})

console.log('Pseudo')
await test('pseudo valide accepté', async () => {
  const p = await valeur(A, "select public.definir_pseudo('Agent Lambert')")
  assert.equal(p.pseudo, 'Agent Lambert')
})
await test('pseudo déjà pris refusé', async () => {
  await echoue(en(B, "select public.definir_pseudo('Agent Lambert')"), /déjà pris/)
})
await test('pseudo trop court ou avec des caractères interdits refusé', async () => {
  await echoue(en(B, "select public.definir_pseudo('ab')"), /check constraint/)
  await echoue(en(B, "select public.definir_pseudo('<script>')"), /check constraint/)
})

console.log('Boosters')
await test('3 boosters gratuits puis plus rien en stock', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await valeur(A, "select public.ouvrir_booster('standard', true)")
    assert.equal(r.cartes.length, 5)
    assert.equal(r.profil.boosters, 2 - i)
  }
  await echoue(en(A, "select public.ouvrir_booster('standard', true)"), /Aucun dossier en stock/)
})
await test('les exemplaires tirés sont bien enregistrés, avec un numéro de série', async () => {
  const r = (await en(A, 'select count(*)::int as n, count(numero_serie)::int as series from public.exemplaires')).rows[0]
  assert.deepEqual(r, { n: 15, series: 15 })
})
await test('un booster payant ne sort pas du stock et exige des crédits', async () => {
  await echoue(en(A, "select public.ouvrir_booster('keter', true)"), /pas gratuitement/)
  await echoue(en(A, "select public.ouvrir_booster('keter', false)"), /Crédits insuffisants/)
})
await test('un booster O5 coûte 1 200 crédits et ne donne que du rare ou mieux', async () => {
  await admin(`update public.profils set credits = 5000 where id = '${A}'`)
  const r = await valeur(A, "select public.ouvrir_booster('o5', false)")
  assert.equal(r.profil.credits, 3800)
  const raretes = (
    await admin(
      `select c.ra from jsonb_array_elements($1::jsonb) with ordinality t(carte, rang) join public.cartes c on c.id = t.carte ->> 'id' order by t.rang`,
      [JSON.stringify(r.cartes)],
    )
  ).rows.map((x) => x.ra)
  assert.ok(
    raretes.every((ra) => ra >= 2),
    `raretés ${raretes}`,
  )
  assert.ok(raretes[4] >= 3, 'la dernière carte est au moins épique')
  const mouvement = (await en(A, "select montant from public.mouvements_credits where motif = 'booster'")).rows[0]
  assert.equal(Number(mouvement.montant), -1200)
})
await test('les cartes souhaitées sont retirées de la liste et les nouvelles signalées', async () => {
  const etat = await valeur(A, 'select public.mon_etat()')
  assert.ok(etat.profil.nouvelles.length > 0)
  await en(A, 'select public.maj_preferences(\'{"souhaits": ["scp-173"]}\')')
  await admin(`update public.profils set boosters = 1 where id = '${A}'`)
  // Le tirage est aléatoire : on vérifie que le souhait disparaît si et seulement si la carte est tombée
  const r = await valeur(A, "select public.ouvrir_booster('standard', true)")
  const tirees = r.cartes.map((c) => c.id)
  assert.equal(r.profil.souhaits.includes('scp-173'), !tirees.includes('scp-173'))
})
await test('une Mythique tombe en version standard, numérotée, sans doublon dans le dossier', async () => {
  await admin(`update prive.types_boosters set mythique = 1 where id = 'standard'`)
  await admin(`update public.profils set boosters = 2 where id = '${A}'`)
  try {
    const r = await valeur(A, "select public.ouvrir_booster('standard', true)")
    const ids = r.cartes.map((c) => c.id)
    const raretes = (await admin('select ra from public.cartes where id = any($1)', [ids])).rows.map((x) => x.ra)
    assert.deepEqual(raretes, [5, 5, 5, 5, 5])
    assert.equal(new Set(ids).size, 5)
    assert.ok(
      r.cartes.every((c) => c.v === 'std' && c.n === 1),
      JSON.stringify(r.cartes),
    )
    // Le numéro suit l'ordre d'obtention de chaque carte
    const s = await valeur(A, "select public.ouvrir_booster('standard', true)")
    for (const c of s.cartes) assert.equal(c.n, ids.includes(c.id) ? 2 : 1)
  } finally {
    await admin(`update prive.types_boosters set mythique = 0.0004 where id = 'standard'`)
  }
})
await test('une Mythique se recycle 2 500 ₵ et compte dans le classement des légendaires', async () => {
  const id = (await admin('select id from public.cartes where ra = 5 limit 1')).rows[0].id
  assert.equal((await admin(`select prive.valeur_brulage(5, 'std') as v`)).rows[0].v, 2500)
  const avant = await valeur(A, "select (public.classement('legendaires') -> 'moi' ->> 'valeur')::int")
  assert.ok(avant >= 5, `légendaires et mythiques : ${avant}`)
  const n = (await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${A}' and carte_id = $1`, [id])).rows[0].n
  if (n >= 2) assert.equal(await valeur(A, "select (public.recycler_doublons($1) ->> 'gain')::int", [id]), (n - 1) * 2500)
})
await test('boosters gratuits recrédités avec le temps, 10 au maximum', async () => {
  await admin(`update public.profils set boosters = 0, dernier_booster = now() - interval '35 minutes' where id = '${A}'`)
  assert.equal((await valeur(A, 'select public.mon_etat()')).profil.boosters, 3)
  await admin(`update public.profils set boosters = 0, dernier_booster = now() - interval '5 days' where id = '${A}'`)
  assert.equal((await valeur(A, 'select public.mon_etat()')).profil.boosters, 10)
})
await test('probabilités de rareté conformes au dossier standard (100 000 tirages)', async () => {
  const r = (
    await admin(`select prive.tirer_indice('{0.66,0.24,0.075,0.02,0.005}') as i, count(*)::int as n from generate_series(1, 100000) group by 1 order by 1`)
  ).rows
  const attendu = [0.66, 0.24, 0.075, 0.02, 0.005]
  for (const { i, n } of r) assert.ok(Math.abs(n / 100000 - attendu[i]) < 0.006, `rareté ${i} : ${n}`)
})
await test('probabilité de variante proche de 7,85 % (100 000 tirages)', async () => {
  const n = (await admin(`select count(*) filter (where prive.tirer_variante(1) <> 'std')::int as n from generate_series(1, 100000)`)).rows[0].n
  assert.ok(Math.abs(n / 100000 - 0.0785) < 0.004, `${n} variantes`)
})

console.log('Sécurité des tables')
await test('un joueur ne voit ni le profil ni les cartes des autres', async () => {
  await valeur(B, "select public.ouvrir_booster('standard', true)")
  assert.equal((await en(A, 'select count(*)::int as n from public.profils')).rows[0].n, 1)
  assert.equal((await en(A, `select count(*)::int as n from public.exemplaires where proprietaire = '${B}'`)).rows[0].n, 0)
})
await test('impossible de se donner des crédits en écrivant dans la table', async () => {
  await en(A, 'update public.profils set credits = 999999').catch((e) => assert.match(e.message, /permission denied/))
  const credits = (await admin(`select credits from public.profils where id = '${A}'`)).rows[0].credits
  assert.notEqual(Number(credits), 999999)
})
await test("impossible de s'ajouter une carte en écrivant dans la table", async () => {
  await echoue(
    en(A, `insert into public.exemplaires (proprietaire, carte_id, origine) values ('${A}', 'scp-173', 'booster')`),
    /row-level security|permission denied/,
  )
})
await test('le schéma privé est inaccessible', async () => {
  await echoue(en(A, 'select * from prive.tirages'), /permission denied/)
})

console.log('Recyclage')
await test('recycle les doublons standard et garde un exemplaire', async () => {
  // Les boosters précédents sont aléatoires : on part d'une situation connue pour cette carte
  await admin(`delete from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)
  await admin(
    `insert into public.exemplaires (proprietaire, carte_id, numero_serie, origine) select '${A}', 'scp-096', 900 + g, 'booster' from generate_series(1, 3) g`,
  )
  const avant = Number((await admin(`select credits from public.profils where id = '${A}'`)).rows[0].credits)
  const r = await valeur(A, "select public.recycler_doublons('scp-096')")
  const ra = (await admin("select ra from public.cartes where id = 'scp-096'")).rows[0].ra
  const deja = (await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)).rows[0].n
  assert.equal(deja, 1)
  assert.equal(r.gain, 2 * [5, 12, 35, 90, 300, 2500][ra])
  assert.equal(Number(r.profil.credits), avant + r.gain)
  const garde = (await admin(`select numero_serie from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)).rows[0].numero_serie
  assert.equal(garde, 901, 'le plus petit numéro de série est conservé')
})
await test("une variante rare ne compte pas comme l'exemplaire gardé : le dernier standard reste", async () => {
  await admin(`insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine) values ('${A}', 'scp-096', 'holo', 900, 'booster')`)
  const r = await valeur(A, "select public.recycler_doublons('scp-096')")
  assert.equal(r.gain, 0)
  const restants = (await admin(`select variante from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096' order by variante`)).rows
  assert.deepEqual(
    restants.map((x) => x.variante),
    ['holo', 'std'],
  )
})

console.log('Cartes offertes')
await test("l'import de partie locale n'existe plus", async () => {
  await echoue(en(B, 'select public.importer_souvenir($1)', ['{"collection": {"scp-173": 50}}']), /does not exist/)
})
await test('les souvenirs déjà importés ne rapportent rien au recyclage', async () => {
  await admin(
    `insert into public.exemplaires (proprietaire, carte_id, origine, echangeable) select '${B}', 'scp-682', 'souvenir', false from generate_series(1, 4)`,
  )
  const r = await valeur(B, "select public.recycler_doublons('scp-682')")
  assert.equal(r.gain, 0)
})
await test('un visiteur ne peut appeler aucune fonction, même interne', async () => {
  for (const f of ['public.ouvrir_booster($1, true)', 'public.maj_preferences($1)']) {
    await echoue(en(null, `select ${f}`, [f.includes('booster') ? 'standard' : '{}']), /permission denied/)
  }
  await echoue(en(A, "select prive.recycler($1, 'scp-173')", [A]), /permission denied/)
  await echoue(en(A, 'select prive.prochain_numero($1, $2)', ['scp-173', 'std']), /permission denied/)
})
await test('les fonctions ajoutées plus tard ne sont pas exposées par défaut', async () => {
  await admin('create function public.fonction_oubliee() returns int language sql as $$ select 1 $$')
  await echoue(en(A, 'select public.fonction_oubliee()'), /permission denied/)
  await echoue(en(null, 'select public.fonction_oubliee()'), /permission denied/)
  await admin('drop function public.fonction_oubliee()')
})

// Les duels, désormais arbitrés par la fonction Edge, sont testés par outils/tester_duel.mjs

console.log('Préférences')
await test("l'équipe ne peut contenir que des cartes possédées", async () => {
  const absente = (
    await admin(
      `select id from public.cartes c where not exists (select 1 from public.exemplaires x where x.proprietaire = '${A}' and x.carte_id = c.id) limit 1`,
    )
  ).rows[0].id
  await echoue(en(A, 'select public.maj_preferences($1)', [JSON.stringify({ equipe: [absente] })]), /Équipe invalide/)
  const possedee = (await en(A, 'select carte_id from public.exemplaires limit 1')).rows[0].carte_id
  await en(A, 'select public.maj_preferences($1)', [JSON.stringify({ equipe: [possedee], langue: 'vf', affichage: { [possedee]: 'std' } })])
  const p = (await valeur(A, 'select public.mon_etat()')).profil
  assert.deepEqual(p.equipe, [possedee])
  assert.equal(p.langue, 'vf')
})
await test('les préférences ne touchent pas aux crédits', async () => {
  const avant = (await valeur(A, 'select public.mon_etat()')).profil.credits
  await en(A, `select public.maj_preferences('{"credits": 999999, "boosters": 10}')`)
  assert.equal((await valeur(A, 'select public.mon_etat()')).profil.credits, avant)
})
await test('favoris, souhaits et affichage ne gardent que des cartes du catalogue', async () => {
  await en(A, 'select public.maj_preferences($1)', [
    JSON.stringify({
      favoris: ['scp-173', 'scp-173', "x'); drop table public.profils; --", 'scp-096'],
      souhaits: { pas: 'une liste' },
      affichage: { 'scp-173': 'holo', 'scp-096': 'dorée', inexistante: 'o5' },
    }),
  ])
  const p = (await valeur(A, 'select public.mon_etat()')).profil
  assert.deepEqual(p.favoris, ['scp-173', 'scp-096'])
  assert.deepEqual(p.souhaits, [])
  assert.deepEqual(p.affichage, { 'scp-173': 'holo' })
  assert.equal((await admin('select count(*)::int as n from public.profils')).rows[0].n, 2, 'la table profils existe toujours')
})
await test('préférences trop volumineuses ou mal formées refusées', async () => {
  await echoue(en(A, 'select public.maj_preferences($1)', [JSON.stringify({ affichage: { x: 'a'.repeat(300000) } })]), /trop volumineuses/)
  await echoue(en(A, 'select public.maj_preferences($1)', ['[1, 2]']), /invalides/)
  await echoue(en(A, 'select public.maj_preferences($1)', [JSON.stringify({ equipe: 'scp-173' })]), /Équipe invalide/)
})

console.log('Hôtel des ventes')
const C = '00000000-0000-0000-0000-00000000000c'
const D = '00000000-0000-0000-0000-00000000000d'
await db.exec(`insert into auth.users (id) values ('${C}'), ('${D}')`)
await admin(`update public.profils set pseudo = 'Docteur Bravo', credits = 10000 where id = '${B}'`)
await admin(`update public.profils set pseudo = 'Chercheur Charlie', credits = 10000 where id = '${C}'`)
await admin(`update public.profils set credits = 10000 where id = '${A}'`)
const credits = async (j) => Number((await admin('select credits from public.profils where id = $1', [j])).rows[0].credits)
/** Donne n exemplaires d'une carte, avec des numéros de série uniques. */
let serie = 5000
async function donner(joueur, carte, n = 1, variante = 'std', origine = 'booster') {
  for (let i = 0; i < n; i++) {
    await admin(`insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine, echangeable) values ($1, $2, $3, $4, $5, $6)`, [
      joueur,
      carte,
      variante,
      origine === 'souvenir' ? null : serie++,
      origine,
      origine !== 'souvenir',
    ])
  }
}
const possede = async (j, carte, variante = 'std') =>
  (await admin('select count(*)::int as n from public.exemplaires where proprietaire = $1 and carte_id = $2 and variante = $3', [j, carte, variante])).rows[0].n
const echoir = (id) => admin("update public.encheres set fin = now() - interval '1 second' where id = $1", [id])

await test('le marché demande un pseudo', async () => {
  await donner(D, 'scp-049')
  await echoue(en(D, "select public.mettre_aux_encheres('scp-049', 'std', 100, 60, null)"), /pseudo/)
})
await test('mise en vente : durée, prix et possession vérifiés', async () => {
  await donner(A, 'scp-173', 2)
  await echoue(en(A, "select public.mettre_aux_encheres('scp-173', 'std', 100, 42, null)"), /Durée invalide/)
  await echoue(en(A, "select public.mettre_aux_encheres('scp-173', 'std', 0, 60, null)"), /Prix de départ invalide/)
  await echoue(en(A, "select public.mettre_aux_encheres('scp-173', 'std', 100, 60, 100)"), /achat immédiat/)
  await echoue(en(A, "select public.mettre_aux_encheres('scp-173', 'o5', 100, 60, null)"), /Aucun exemplaire libre/)
  await donner(A, 'scp-999', 1, 'std', 'souvenir')
  await echoue(en(A, "select public.mettre_aux_encheres('scp-999', 'std', 100, 60, null)"), /Aucun exemplaire libre/)
})
let vente
await test("l'exemplaire mis en vente est réservé, au plus grand numéro de série", async () => {
  vente = (await valeur(A, "select public.mettre_aux_encheres('scp-173', 'std', 100, 60, null)")).id
  const e = (
    await admin(
      'select x.bloque_par, x.numero_serie, (select max(numero_serie) from public.exemplaires where proprietaire = $2 and carte_id = $3) as maxi from public.encheres e join public.exemplaires x on x.id = e.exemplaire where e.id = $1',
      [vente, A, 'scp-173'],
    )
  ).rows[0]
  assert.equal(e.bloque_par, vente)
  assert.equal(e.numero_serie, e.maxi)
})
await test("impossible d'écrire dans les tables du marché", async () => {
  await echoue(en(A, `update public.encheres set mise = 1, encherisseur = '${A}'`), /permission denied/)
  await echoue(en(A, `insert into public.ventes (carte_id, variante, prix) values ('scp-173', 'std', 999999)`), /permission denied/)
  await echoue(en(null, 'select count(*) from public.encheres'), /permission denied/)
})
await test('mises : pas sur sa propre vente, pas sans crédits, pas sous le minimum', async () => {
  await echoue(en(A, 'select public.encherir($1, 200)', [vente]), /propre vente/)
  await echoue(en(B, 'select public.encherir($1, 99)', [vente]), /Mise minimale : 100/)
  await admin(`update public.profils set credits = 50 where id = '${C}'`)
  await echoue(en(C, 'select public.encherir($1, 100)', [vente]), /Crédits insuffisants/)
  await admin(`update public.profils set credits = 10000 where id = '${C}'`)
})
await test('une mise est prélevée, et rendue quand on est surenchéri (+5 % minimum)', async () => {
  await valeur(B, 'select public.encherir($1, 100)', [vente])
  assert.equal(await credits(B), 9900)
  await echoue(en(B, 'select public.encherir($1, 200)', [vente]), /déjà le meilleur/)
  await echoue(en(C, 'select public.encherir($1, 104)', [vente]), /Mise minimale : 105/)
  await valeur(C, 'select public.encherir($1, 105)', [vente])
  assert.equal(await credits(B), 10000, 'B remboursé')
  assert.equal(await credits(C), 9895)
})
await test('une mise de dernière seconde prolonge la vente de 2 minutes', async () => {
  await admin("update public.encheres set fin = now() + interval '20 seconds' where id = $1", [vente])
  await valeur(B, 'select public.encherir($1, 120)', [vente])
  const reste = (await admin('select extract(epoch from fin - now())::int as s from public.encheres where id = $1', [vente])).rows[0].s
  assert.ok(reste >= 110, `${reste} s restantes`)
})
await test("l'historique des mises donne le pseudo de chaque enchérisseur, et la liste le meneur", async () => {
  const h = await valeur(A, 'select public.historique_mises($1)', [vente])
  assert.deepEqual(
    h.map((m) => [m.pseudo, Number(m.montant)]),
    [
      ['Docteur Bravo', 120],
      ['Chercheur Charlie', 105],
      ['Docteur Bravo', 100],
    ],
  )
  assert.ok(
    h.every((m) => m.moi === false),
    "A n'a pas misé",
  )
  assert.equal((await valeur(B, 'select public.historique_mises($1)', [vente]))[0].moi, true)
  const e = (await valeur(C, 'select public.marche()')).ouvertes.find((x) => x.id === vente)
  assert.equal(e.meneur, 'Docteur Bravo')
  await echoue(en(null, 'select public.historique_mises($1)', [vente]), /permission denied/)
})
await test('une vente qui a reçu une mise ne peut plus être retirée', async () => {
  await echoue(en(A, 'select public.annuler_enchere($1)', [vente]), /déjà reçu une mise/)
})
await test('à échéance : la carte part au meilleur enchérisseur, le vendeur touche la mise moins 5 %', async () => {
  const avant = await credits(A)
  await echoir(vente)
  const m = await valeur(A, 'select public.marche()')
  assert.ok(!m.ouvertes.some((e) => e.id === vente))
  assert.equal(await credits(A), avant + 120 - 6)
  const ex = (
    await admin('select x.proprietaire, x.origine, x.bloque_par from public.encheres e join public.exemplaires x on x.id = e.exemplaire where e.id = $1', [
      vente,
    ])
  ).rows[0]
  assert.deepEqual(ex, { proprietaire: B, origine: 'enchere', bloque_par: null })
  assert.equal(await credits(B), 10000 - 120)
  assert.equal(m.historique[0].statut, 'vendue')
})
await test('le cours de la carte reflète la vente', async () => {
  const c = await valeur(B, "select public.cours_carte('scp-173')")
  assert.equal(c.variantes.std.dernier, 120)
  assert.equal(c.variantes.std.volume30, 1)
  assert.equal(c.variantes.std.points.length, 1)
  assert.equal(c.variantes.std.libres, 1)
})
await test('achat immédiat : la vente se conclut au prix fixé, même si on mise plus', async () => {
  const id = (await valeur(A, "select public.mettre_aux_encheres('scp-173', 'std', 100, 1440, 500)")).id
  const avant = await credits(C)
  const r = await valeur(C, 'select public.encherir($1, 900)', [id])
  assert.equal(r.immediat, true)
  assert.equal(await credits(C), avant - 500)
  assert.equal((await admin('select statut from public.encheres where id = $1', [id])).rows[0].statut, 'vendue')
  assert.equal(await possede(C, 'scp-173'), 1)
})
await test('sans mise, la carte revient à son vendeur ; on peut retirer une vente sans mise', async () => {
  await donner(A, 'scp-096', 2)
  const id = (await valeur(A, "select public.mettre_aux_encheres('scp-096', 'std', 100, 15, null)")).id
  await echoir(id)
  await valeur(A, 'select public.marche()')
  assert.equal((await admin('select statut from public.encheres where id = $1', [id])).rows[0].statut, 'invendue')
  const id2 = (await valeur(A, "select public.mettre_aux_encheres('scp-096', 'std', 100, 15, null)")).id
  await valeur(A, 'select public.annuler_enchere($1)', [id2])
  const bloques = (await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${A}' and bloque_par is not null`)).rows[0].n
  assert.equal(bloques, 0)
})
await test('une carte en vente ne se recycle ni ne se brûle', async () => {
  await admin(`delete from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-682'`)
  await donner(A, 'scp-682', 1)
  await valeur(A, "select public.mettre_aux_encheres('scp-682', 'std', 100, 60, null)")
  assert.equal((await valeur(A, "select public.recycler_doublons('scp-682')")).gain, 0)
  await echoue(en(A, "select public.bruler('scp-682', 'std')"), /Aucun exemplaire libre/)
})

console.log('Brûler')
await test('brûler rend la valeur de la carte, multipliée par sa variante', async () => {
  await donner(B, 'scp-055', 1, 'holo')
  const ra = (await admin("select ra from public.cartes where id = 'scp-055'")).rows[0].ra
  const avant = await credits(B)
  const r = await valeur(B, "select public.bruler('scp-055', 'holo')")
  assert.equal(r.gain, [5, 12, 35, 90, 300][ra] * 3)
  assert.equal(await credits(B), avant + r.gain)
  assert.equal(await possede(B, 'scp-055', 'holo'), 0)
})
await test("brûler son dernier exemplaire le retire de l'équipe ; les souvenirs ne se brûlent pas", async () => {
  await donner(B, 'scp-106', 1)
  await admin(`update public.profils set equipe = '{scp-106}' where id = '${B}'`)
  await valeur(B, "select public.bruler('scp-106', 'std')")
  assert.deepEqual((await admin(`select equipe from public.profils where id = '${B}'`)).rows[0].equipe, [])
  await donner(B, 'scp-999', 1, 'std', 'souvenir')
  await echoue(en(B, "select public.bruler('scp-999', 'std')"), /Aucun exemplaire libre/)
})

await test('brûlage groupé : les doublons gardent un exemplaire, « un » brûle le dernier', async () => {
  await donner(B, 'scp-173', 3)
  await donner(B, 'scp-096', 1)
  await donner(B, 'scp-096', 1, 'holo')
  const ra = (await admin("select ra from public.cartes where id = 'scp-173'")).rows[0].ra
  const attendus = (await possede(B, 'scp-173', 'std')) - 1 + (await possede(B, 'scp-096', 'std')) - 1
  const r = await valeur(B, "select public.bruler_lot(array['scp-173', 'scp-096'], 'doublons')")
  // scp-096 : on garde toujours un exemplaire standard, la variante holo ne compte pas comme l'exemplaire gardé
  assert.equal(await possede(B, 'scp-173', 'std'), 1)
  assert.equal(await possede(B, 'scp-096', 'std'), 1)
  assert.equal(await possede(B, 'scp-096', 'holo'), 1)
  assert.equal(r.detruits, attendus)
  assert.equal((await valeur(B, "select public.bruler_lot(array['scp-173'], 'un')")).gain, [5, 12, 35, 90, 300, 2500][ra])
  assert.equal(await possede(B, 'scp-173', 'std'), 0)
  await echoue(en(B, "select public.bruler_lot(array['scp-173'], 'autre')"), /inconnu/)
  await echoue(en(null, "select public.bruler_lot(array['scp-173'], 'un')"), /permission denied/)
})

console.log('Échanges')
await test('chercher un joueur par le début de son pseudo', async () => {
  assert.deepEqual(await valeur(A, "select public.chercher_joueurs('doc')"), ['Docteur Bravo'])
  assert.deepEqual(await valeur(A, "select public.chercher_joueurs('%')"), [], 'les jokers sont neutralisés')
})
await test("on ne voit que les cartes libres d'un autre joueur", async () => {
  await donner(B, 'scp-3000', 1)
  const c = await valeur(A, "select public.collection_echangeable('Docteur Bravo')")
  assert.ok(c.some((x) => x.c === 'scp-3000'))
  assert.ok(!c.some((x) => x.c === 'scp-999'), 'pas les souvenirs')
})
await test('offres invalides refusées', async () => {
  await donner(A, 'scp-2000', 2)
  await echoue(en(A, "select public.proposer_echange('Agent Lambert', '[{\"c\":\"scp-2000\"}]', '[]', 0, 10, null)"), /soi-même/)
  await echoue(en(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\"}]', '[]', 0, 0, null)"), /contrepartie|au moins une carte/)
  await echoue(
    en(A, 'select public.proposer_echange(\'Docteur Bravo\', \'[{"c":"scp-2000","v":"o5"}]\', \'[{"c":"scp-3000"}]\', 0, 0, null)'),
    /pas d'exemplaire libre/,
  )
  await echoue(en(A, 'select public.proposer_echange(\'Docteur Bravo\', \'[{"c":"scp-2000"}]\', \'[{"c":"scp-002"}]\', 0, 0, null)'), /n'a pas ces cartes/)
  await echoue(en(A, "select public.proposer_echange('Docteur Bravo', '[]', '[{\"c\":\"scp-3000\"}]', 99999999, 0, null)"), /Montant invalide/)
})
let offre
await test('proposer réserve ses cartes et ses crédits', async () => {
  const avant = await credits(A)
  offre = (await valeur(A, 'select public.proposer_echange(\'Docteur Bravo\', \'[{"c":"scp-2000"}]\', \'[{"c":"scp-3000"}]\', 50, 0, \'Marché conclu ?\')')).id
  assert.equal(await credits(A), avant - 50)
  const bloques = (await admin('select count(*)::int as n from public.exemplaires where bloque_par = $1', [offre])).rows[0].n
  assert.equal(bloques, 1)
  const recues = (await valeur(B, 'select public.mes_echanges()')).filter((o) => o.recue)
  assert.equal(recues[0].avec, 'Agent Lambert')
  assert.equal(recues[0].message, 'Marché conclu ?')
})
await test("un tiers ne peut ni voir ni accepter l'offre", async () => {
  await echoue(en(C, 'select public.repondre_echange($1, true)', [offre]), /introuvable/)
  assert.equal((await en(C, 'select count(*)::int as n from public.offres')).rows[0].n, 0)
})
await test("accepter échange tout d'un coup : cartes et crédits", async () => {
  const [a0, b0] = [await credits(A), await credits(B)]
  await valeur(B, 'select public.repondre_echange($1, true)', [offre])
  assert.equal(await possede(B, 'scp-2000'), 1)
  assert.equal(await possede(A, 'scp-3000'), 1)
  assert.equal(await possede(B, 'scp-3000'), 0)
  assert.equal(await credits(A), a0)
  assert.equal(await credits(B), b0 + 50)
  const o = (await valeur(A, 'select public.mes_echanges()')).find((x) => x.id === offre)
  assert.equal(o.statut, 'acceptee')
  assert.ok(o.demande[0].s, 'le numéro de série reçu est connu')
})
await test("accepter une offre qu'on ne peut plus honorer n'échange rien", async () => {
  await donner(B, 'scp-5000', 1)
  const id = (await valeur(A, 'select public.proposer_echange(\'Docteur Bravo\', \'[{"c":"scp-2000"}]\', \'[{"c":"scp-5000"}]\', 0, 0, null)')).id
  // B met entre-temps sa carte en vente : elle n'est plus libre
  await valeur(B, "select public.mettre_aux_encheres('scp-5000', 'std', 100, 60, null)")
  await echoue(en(B, 'select public.repondre_echange($1, true)', [id]), /plus d'exemplaire libre/)
  assert.equal(await possede(A, 'scp-2000'), 1, 'A garde sa carte')
  assert.equal((await admin('select statut from public.offres where id = $1', [id])).rows[0].statut, 'ouverte')
  await valeur(A, 'select public.annuler_echange($1)', [id])
  assert.equal(
    (await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${A}' and bloque_par is not null`)).rows[0].n,
    1,
    'seule scp-682 reste en vente',
  )
})
await test('refuser ou laisser expirer rend cartes et crédits', async () => {
  await donner(B, 'scp-6000', 2)
  const avant = await credits(A)
  const r = (await valeur(A, "select public.proposer_echange('Docteur Bravo', '[]', '[{\"c\":\"scp-6000\"}]', 30, 0, null)")).id
  await valeur(B, 'select public.repondre_echange($1, false)', [r])
  assert.equal(await credits(A), avant)
  const x = (await valeur(A, 'select public.proposer_echange(\'Docteur Bravo\', \'[{"c":"scp-2000"}]\', \'[{"c":"scp-6000"}]\', 30, 0, null)')).id
  await admin("update public.offres set expire_le = now() - interval '1 second' where id = $1", [x])
  await valeur(A, 'select public.mes_echanges()')
  assert.equal((await admin('select statut from public.offres where id = $1', [x])).rows[0].statut, 'expiree')
  assert.equal(await credits(A), avant)
  assert.equal((await admin('select count(*)::int as n from public.exemplaires where bloque_par = $1', [x])).rows[0].n, 0)
})
await test('mon_etat signale les exemplaires réservés et les offres reçues', async () => {
  const id = (await valeur(A, 'select public.proposer_echange(\'Docteur Bravo\', \'[{"c":"scp-2000"}]\', \'[{"c":"scp-6000"}]\', 0, 0, null)')).id
  const e = await valeur(A, 'select public.mon_etat()')
  assert.equal(e.collection.find((x) => x.c === 'scp-2000').b, 1)
  assert.equal((await valeur(B, 'select public.mon_etat()')).offresRecues, 1)
  await valeur(A, 'select public.annuler_echange($1)', [id])
})
await test('supprimer son compte rend les mises reçues et libère les offres faites par les autres', async () => {
  await donner(C, 'scp-7000', 1)
  const id = (await valeur(C, "select public.mettre_aux_encheres('scp-7000', 'std', 100, 60, null)")).id
  const avant = await credits(A)
  await valeur(A, 'select public.encherir($1, 300)', [id])
  const o = await valeur(A, "select public.proposer_echange('Chercheur Charlie', '[{\"c\":\"scp-2000\"}]', '[]', 0, 0, null)").catch(() => null)
  assert.equal(o, null, 'offre sans contrepartie refusée')
  await donner(C, 'scp-7001', 1)
  const offreC = (await valeur(A, 'select public.proposer_echange(\'Chercheur Charlie\', \'[{"c":"scp-2000"}]\', \'[{"c":"scp-7001"}]\', 25, 0, null)')).id
  await en(C, 'select public.supprimer_mon_compte()')
  assert.equal(await credits(A), avant, "mise et crédits de l'offre rendus")
  assert.equal((await admin('select count(*)::int as n from public.exemplaires where bloque_par = $1', [offreC])).rows[0].n, 0)
})

console.log('Notifications')
const types = async (j) => (await valeur(j, 'select public.mes_notifications()')).liste.map((n) => n.type)
await test('ventes et échanges déjà joués ont laissé leurs notifications', async () => {
  assert.ok((await types(A)).includes('vente_conclue'), (await types(A)).join(','))
  assert.ok((await types(A)).includes('echange_accepte'))
  assert.ok((await types(B)).includes('echange_recu'))
})
const N = '00000000-0000-0000-0000-0000000000a1'
await db.exec(`insert into auth.users (id) values ('${N}')`)
await admin(`update public.profils set pseudo = 'Novice Nina', credits = 10000 where id = '${N}'`)
await test('carte souhaitée mise en vente, surenchère : le bon joueur est prévenu', async () => {
  await en(N, `select public.maj_preferences('{"souhaits": ["scp-5000"]}')`)
  await donner(A, 'scp-5000')
  const id = (await valeur(A, "select public.mettre_aux_encheres('scp-5000', 'std', 100, 60, null)")).id
  const souhait = (await valeur(N, 'select public.mes_notifications()')).liste.find((n) => n.type === 'souhait_en_vente')
  assert.equal(souhait?.donnees.carte, 'scp-5000')
  assert.ok(!(await types(A)).includes('souhait_en_vente'), 'pas le vendeur')
  await valeur(B, 'select public.encherir($1, 100)', [id])
  await valeur(N, 'select public.encherir($1, 200)', [id])
  const surenchere = (await valeur(B, 'select public.mes_notifications()')).liste.find((n) => n.type === 'surencheri' && n.donnees.enchere === id)
  assert.equal(surenchere?.donnees.par, 'Novice Nina')
})
await test('lues à la demande, privées, illisibles sans connexion', async () => {
  assert.ok((await valeur(B, 'select public.mes_notifications()')).nonLues > 0)
  await en(B, 'select public.lire_notifications()')
  assert.equal((await valeur(B, 'select public.mes_notifications()')).nonLues, 0)
  const autres = (await en(N, `select count(*)::int as n from public.notifications where joueur <> '${N}'`)).rows[0].n
  assert.equal(autres, 0)
  await echoue(en(null, 'select count(*) from public.notifications'), /permission denied/)
  await echoue(en(B, "insert into public.notifications (joueur, type) values ($1, 'echange_recu')", [B]), /permission denied/)
})

console.log('Amis et blocages')
const E = '00000000-0000-0000-0000-00000000000e'
const F = '00000000-0000-0000-0000-00000000000f'
const G = '00000000-0000-0000-0000-000000000010'
await db.exec(`insert into auth.users (id) values ('${E}'), ('${F}'), ('${G}')`)
await admin(`update public.profils set pseudo = 'Echo', credits = 5000 where id = '${E}'`)
await admin(`update public.profils set pseudo = 'Foxtrot', credits = 500 where id = '${F}'`)
await admin(`update public.profils set pseudo = 'Golf', credits = 100 where id = '${G}'`)
const EQUIPE = ['scp-173', 'scp-096', 'scp-682', 'scp-049', 'scp-106']
for (const j of [E, F, G]) {
  for (const c of EQUIPE) await donner(j, c)
  await admin('update public.profils set equipe = $1 where id = $2', [EQUIPE, j])
}

await test("une demande d'ami réciproque devient une amitié", async () => {
  assert.equal(await valeur(E, "select public.demander_ami('foxtrot')"), 'demande')
  const f = await valeur(F, 'select public.mes_amis()')
  assert.deepEqual(f.recues, ['Echo'])
  assert.equal(await valeur(F, "select public.demander_ami('Echo')"), 'ami')
  const e = await valeur(E, 'select public.mes_amis()')
  assert.deepEqual(
    e.amis.map((a) => a.pseudo),
    ['Foxtrot'],
  )
  assert.deepEqual(e.envoyees, [])
})
await test("on ne peut pas s'ajouter soi-même ni ajouter un agent inconnu", async () => {
  await echoue(en(E, "select public.demander_ami('Echo')"), /soi-même/)
  await echoue(en(E, "select public.demander_ami('Personne')"), /introuvable/)
})
await test("bloquer retire l'amitié et empêche de redemander", async () => {
  await valeur(G, "select public.demander_ami('Echo')")
  await valeur(E, "select public.bloquer('Golf')")
  assert.deepEqual((await valeur(E, 'select public.mes_amis()')).recues, [])
  await echoue(en(G, "select public.demander_ami('Echo')"), /Impossible/)
  await valeur(E, "select public.debloquer('Golf')")
  assert.equal(await valeur(G, "select public.demander_ami('Echo')"), 'demande')
  await valeur(E, "select public.repondre_ami('Golf', false)")
})

console.log('Clans')
await test('fonder un clan coûte 2 000 crédits', async () => {
  await echoue(en(F, "select public.creer_clan('Les Pauvres', 'PAU', '', true)"), /2 000 crédits/)
  assert.equal(await valeur(E, "select public.creer_clan('Site-19', 'S19', 'Le clan du site', false)"), 'S19')
  assert.equal(await credits(E), 3000)
  const c = await valeur(E, "select public.fiche_clan('')")
  assert.equal(c.monRole, 'chef')
})
await test('nom ou tag déjà pris, ou mal formés : refusés', async () => {
  await admin(`update public.profils set credits = 5000 where id = '${G}'`)
  await echoue(en(G, "select public.creer_clan('Site-19', 'AUT', '', true)"), /déjà pris/)
  await echoue(en(G, "select public.creer_clan('Autre', 'TROPLONG', '', true)"), /invalide/)
  assert.equal(await credits(G), 5000, 'rien débité')
})
await test('clan fermé : candidature, acceptée par le chef', async () => {
  assert.equal(await valeur(F, "select public.rejoindre_clan('s19')"), 'candidature')
  const c = await valeur(E, "select public.fiche_clan('')")
  assert.deepEqual(
    c.candidatures.map((x) => x.pseudo),
    ['Foxtrot'],
  )
  await echoue(en(F, "select public.gerer_membre('Foxtrot', 'accepter')"), /chef et aux officiers/)
  await valeur(E, "select public.gerer_membre('Foxtrot', 'accepter')")
  assert.equal((await valeur(F, "select public.fiche_clan('')")).monRole, 'membre')
})
await test('les candidatures ne sont visibles que du chef et des officiers', async () => {
  assert.equal((await valeur(F, "select public.fiche_clan('')")).candidatures, null)
})
await test('un officier ne peut pas exclure un autre officier ni promouvoir', async () => {
  await valeur(E, "select public.gerer_membre('Foxtrot', 'promouvoir')")
  await valeur(E, "select public.modifier_clan('Ouvert à tous', true, 'scp-173')")
  assert.equal(await valeur(G, "select public.rejoindre_clan('S19')"), 'membre')
  await echoue(en(F, "select public.gerer_membre('Golf', 'promouvoir')"), /Réservé au chef/)
  await valeur(E, "select public.gerer_membre('Golf', 'promouvoir')")
  await echoue(en(F, "select public.gerer_membre('Golf', 'exclure')"), /Seul le chef/)
  await valeur(E, "select public.gerer_membre('Golf', 'retrograder')")
  await valeur(F, "select public.gerer_membre('Golf', 'exclure')")
  assert.equal(await valeur(G, "select public.fiche_clan('')").then((c) => c.monRole ?? null), null)
})
await test('quand le chef part, le plus ancien officier prend la tête', async () => {
  await valeur(E, 'select public.quitter_clan()')
  assert.equal((await valeur(F, "select public.fiche_clan('')")).monRole, 'chef')
  await valeur(E, "select public.rejoindre_clan('S19')")
})
await test('on ne peut être que dans un seul clan', async () => {
  await admin(`update public.profils set credits = 5000 where id = '${G}'`)
  await valeur(G, "select public.creer_clan('Insurrection', 'CI', '', true)")
  await echoue(en(E, "select public.rejoindre_clan('CI')"), /Quittez d'abord/)
})
await test('la liste des clans indique membres et score', async () => {
  const l = await valeur(E, "select public.liste_clans('')")
  assert.deepEqual(l.map((c) => [c.tag, c.membres]).sort(), [
    ['CI', 1],
    ['S19', 2],
  ])
})

console.log('Messagerie')
await test('le salon du clan est lisible par ses membres seulement', async () => {
  const m = await valeur(E, "select public.envoyer_message('clan', null, '  Bonjour le site\u0007  ')")
  assert.equal(m.texte, 'Bonjour le site', 'espaces et caractères de contrôle retirés')
  const vu = await valeur(F, "select public.messages_salon('clan', null, null)")
  assert.deepEqual(
    vu.messages.map((x) => x.texte),
    ['Bonjour le site'],
  )
  // Lecture directe de la table (ce que fait le direct) : réservée aux membres
  assert.equal((await en(F, 'select count(*)::int as n from public.messages')).rows[0].n, 1)
  assert.equal((await en(G, 'select count(*)::int as n from public.messages')).rows[0].n, 0)
})
await test('messages privés réservés aux amis', async () => {
  await valeur(E, "select public.envoyer_message('mp', 'Foxtrot', 'Salut Foxtrot')")
  await echoue(en(E, "select public.envoyer_message('mp', 'Golf', 'Salut')"), /réservés à vos amis/)
  assert.equal((await en(G, "select count(*)::int as n from public.messages where salon like 'mp:%'")).rows[0].n, 0)
  const conv = await valeur(F, 'select public.conversations()')
  const mp = conv.find((c) => c.type === 'mp' && c.cible === 'Echo')
  assert.equal(mp.nonLus, 1)
  await valeur(F, "select public.messages_salon('mp', 'Echo', null)")
  assert.equal((await valeur(F, 'select public.conversations()')).find((c) => c.cible === 'Echo').nonLus, 0)
})
await test('message vide, trop long ou envoyé en rafale : refusé', async () => {
  await echoue(en(E, "select public.envoyer_message('clan', null, '   ')"), /vide/)
  await echoue(en(E, `select public.envoyer_message('clan', null, '${'x'.repeat(501)}')`), /trop long/)
  for (let i = 0; i < 3; i++) await valeur(E, `select public.envoyer_message('clan', null, 'message ${i}')`)
  await echoue(en(E, "select public.envoyer_message('clan', null, 'un de trop')"), /Doucement/)
})
await test("impossible d'écrire directement dans la table des messages", async () => {
  await echoue(en(E, `insert into public.messages (salon, auteur, pseudo, texte) values ('clan:x', '${E}', 'Echo', 'triche')`), /permission denied/)
})
await test('un message signalé est conservé pour la modération', async () => {
  const id = (await admin("select id from public.messages where texte = 'Bonjour le site'")).rows[0].id
  await valeur(F, 'select public.signaler_message($1, $2)', [id, 'test'])
  assert.equal((await admin('select count(*)::int as n from prive.signalements')).rows[0].n, 1)
  await echoue(en(G, 'select public.signaler_message($1, $2)', [id, 'test']), /introuvable/)
})

console.log('Classements et profils')
await test('classement de la richesse, avec sa propre place', async () => {
  const r = await valeur(F, "select public.classement('richesse')")
  assert.ok(r.lignes.length >= 3)
  assert.ok(
    r.lignes.every((l, i) => i === 0 || Number(l.valeur) <= Number(r.lignes[i - 1].valeur)),
    'trié',
  )
  assert.equal(r.moi.valeur, await credits(F))
  await echoue(en(F, "select public.classement('nimporte')"), /inconnu/)
})
await test('classement de la collection : cartes différentes possédées', async () => {
  const r = await valeur(E, "select public.classement('collection')")
  assert.equal(r.lignes.find((l) => l.pseudo === 'Echo').valeur, 5)
  assert.equal(r.lignes.find((l) => l.pseudo === 'Echo').clan, 'S19')
})
await test('profil public : vitrine, clan, relation', async () => {
  await valeur(E, "select public.maj_vitrine(array['scp-173', 'scp-682'])")
  await echoue(en(E, "select public.maj_vitrine(array['scp-999'])"), /possédées/)
  const p = await valeur(F, "select public.profil_public('echo')")
  assert.deepEqual(
    p.vitrine.map((v) => v.carte),
    ['scp-173', 'scp-682'],
  )
  assert.equal(p.clan.tag, 'S19')
  assert.equal(p.relation, 'ami')
  assert.equal((await valeur(G, "select public.profil_public('Echo')")).relation, 'aucune')
})
await test('badges : calculés par le serveur, 3 au plus affichés, le badge du créateur ne se choisit pas', async () => {
  const p = await valeur(F, "select public.profil_public('Echo')")
  assert.ok(p.badges.includes('esprit-de-corps') && p.badges.includes('premiere-heure'), p.badges.join(','))
  assert.ok(!p.badges.includes('createur'))
  await echoue(en(E, "select public.choisir_badges(array['createur'])"), /obtenus/)
  await echoue(en(E, "select public.choisir_badges(array['esprit-de-corps', 'premiere-heure', 'premier-dossier', 'archiviste'])"), /obtenus/)
  assert.deepEqual(await valeur(E, "select public.choisir_badges(array['premiere-heure', 'esprit-de-corps', 'premiere-heure'])"), [
    'premiere-heure',
    'esprit-de-corps',
  ])
  await admin(`insert into prive.badges_speciaux values ('${E}', 'createur')`)
  await valeur(E, "select public.choisir_badges(array['createur'])")
  assert.deepEqual((await valeur(F, "select public.profil_public('Echo')")).badgesAffiches, ['createur'])
  await admin(`delete from prive.badges_speciaux where joueur = '${E}'`)
  // Un badge perdu disparaît de l'affichage
  assert.deepEqual((await valeur(F, "select public.profil_public('Echo')")).badgesAffiches, [])
})
await test('badges de plusieurs agents en un appel, sans ceux qui n’en affichent pas', async () => {
  await valeur(E, "select public.choisir_badges(array['premiere-heure'])")
  assert.deepEqual(await valeur(F, "select public.badges_affiches_de(array['Echo', 'Personne'])"), { Echo: ['premiere-heure'] })
  await echoue(en(null, "select public.badges_affiches_de(array['Echo'])"), /permission denied/)
})
await test('les classements et profils sont réservés aux joueurs connectés', async () => {
  await echoue(en(null, "select public.classement('elo')"), /permission denied/)
  await echoue(en(null, "select public.profil_public('Echo')"), /permission denied/)
})

console.log('Duels entre joueurs (règles SQL)')
const service = (sql, params) =>
  db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return Object.values((await tx.query(sql, params)).rows[0])[0]
  })
await test('les fonctions jcj_* sont réservées à la clé de service', async () => {
  await echoue(en(E, `select public.jcj_entrer_file('${E}')`), /permission denied/)
  await echoue(en(E, `select public.jcj_clore('${E}', 0, '{}', 'a')`), /permission denied/)
})
let duelClasse
await test('la file apparie deux joueurs proches en Elo', async () => {
  assert.equal((await service(`select public.jcj_entrer_file('${E}')`)).attente, true)
  const r = await service(`select public.jcj_entrer_file('${F}')`)
  duelClasse = r.preparer.id
  assert.equal(r.preparer.joueurA, E, 'le premier arrivé est le joueur A')
  assert.deepEqual(r.preparer.equipeA, EQUIPE)
  assert.equal(r.preparer.classe, true)
  assert.equal((await service(`select public.jcj_entrer_file('${E}')`)).enCours, duelClasse, 'pas de deuxième duel')
})
await test("trop loin en Elo : pas d'appariement immédiat", async () => {
  await admin(`update public.profils set elo = 1600 where id = '${G}'`)
  await admin(`insert into prive.file_jcj (joueur, elo) values ('${G}', 1600)`)
  const H = '00000000-0000-0000-0000-000000000011'
  await db.exec(`insert into auth.users (id) values ('${H}')`)
  await admin(`update public.profils set pseudo = 'Hotel' where id = '${H}'`)
  for (const c of EQUIPE) await donner(H, c)
  await admin('update public.profils set equipe = $1 where id = $2', [EQUIPE, H])
  assert.equal((await service(`select public.jcj_entrer_file('${H}')`)).attente, true)
  await service(`select public.jcj_quitter_file('${G}')`)
  await service(`select public.jcj_quitter_file('${H}')`)
})
await test("l'état public du duel n'est lisible que par ses deux joueurs", async () => {
  await service(`select public.jcj_ecrire('${duelClasse}', 0, '{"phase":"choix"}', '{"bonne":2}')`)
  assert.equal((await en(E, 'select count(*)::int as n from public.duels_jcj')).rows[0].n, 1)
  assert.equal((await en(G, 'select count(*)::int as n from public.duels_jcj')).rows[0].n, 0)
  await echoue(en(E, 'select * from prive.duels_jcj_secret'), /permission denied/)
})
await test('une écriture sur une version périmée est refusée', async () => {
  assert.equal(await service(`select public.jcj_ecrire('${duelClasse}', 0, '{}', '{}')`), false)
})
await test('victoire classée : Elo transféré, crédits et XP', async () => {
  const [eloE, eloF, crE] = [1000, 1000, await credits(E)]
  const gains = await service(`select public.jcj_clore('${duelClasse}', 1, '{"phase":"fin"}', 'a')`)
  assert.equal(gains.a.elo, 16)
  assert.equal(gains.b.elo, -16)
  assert.equal(gains.a.credits, 120)
  assert.equal(gains.b.credits, 25)
  const p = (await admin(`select elo, jcj from public.profils where id = '${E}'`)).rows[0]
  assert.equal(p.elo, eloE + 16)
  assert.equal(p.jcj.victoires, 1)
  assert.equal((await admin(`select elo from public.profils where id = '${F}'`)).rows[0].elo, eloF - 16)
  assert.equal(await credits(E), crE + 120)
  await echoue(service(`select public.jcj_clore('${duelClasse}', 2, '{}', 'a')`), /déjà terminé/)
})
await test('défi amical : entre amis seulement, sans Elo ni crédits', async () => {
  await echoue(service(`select public.jcj_defier('${E}', 'Golf')`), /ses amis/)
  const { id } = await service(`select public.jcj_defier('${E}', 'Foxtrot')`)
  await echoue(service(`select public.jcj_repondre_defi('${E}', '${id}', true)`), /expiré/)
  const r = await service(`select public.jcj_repondre_defi('${F}', '${id}', true)`)
  assert.equal(r.preparer.classe, false)
  await service(`select public.jcj_ecrire('${id}', 0, '{}', '{}')`)
  const elo = (await admin(`select elo from public.profils where id = '${E}'`)).rows[0].elo
  const gains = await service(`select public.jcj_clore('${id}', 1, '{}', 'a')`)
  assert.deepEqual([gains.a.elo, gains.a.credits, gains.a.xp], [0, 0, 15])
  assert.equal((await admin(`select elo from public.profils where id = '${E}'`)).rows[0].elo, elo)
})
await test('au-delà de 3 duels classés par jour contre le même adversaire, plus de crédits', async () => {
  for (let i = 0; i < 3; i++) {
    await service(`select public.jcj_entrer_file('${E}')`)
    const id = (await service(`select public.jcj_entrer_file('${F}')`)).preparer.id
    await service(`select public.jcj_ecrire('${id}', 0, '{}', '{}')`)
    const gains = await service(`select public.jcj_clore('${id}', 1, '{}', 'b')`)
    assert.equal(gains.b.credits, i < 2 ? 120 : 0, `duel ${i + 2} du jour contre Echo`)
  }
})
await test("un défi non accepté expire au bout d'une minute", async () => {
  const { id } = await service(`select public.jcj_defier('${E}', 'Foxtrot')`)
  await admin(`update public.duels_jcj set cree_le = now() - interval '2 minutes' where id = $1`, [id])
  await echoue(service(`select public.jcj_repondre_defi('${F}', '${id}', true)`), /expiré/)
})
await test("accepter un défi est refusé si l'un des deux est déjà en duel", async () => {
  const H = '00000000-0000-0000-0000-000000000011'
  const { id } = await service(`select public.jcj_defier('${E}', 'Foxtrot')`)
  // Entre-temps, Echo est apparié dans la file classée
  await service(`select public.jcj_entrer_file('${E}')`)
  const autre = (await service(`select public.jcj_entrer_file('${H}')`)).preparer.id
  await echoue(service(`select public.jcj_repondre_defi('${F}', '${id}', true)`), /déjà en duel/)
  await admin("update public.duels_jcj set statut = 'annule' where id in ($1, $2)", [id, autre])
})
await test('un visiteur non connecté ne peut lire ni profils, ni cartes, ni mouvements', async () => {
  for (const t of ['profils', 'exemplaires', 'mouvements_credits', 'messages', 'duels_jcj']) {
    await echoue(en(null, `select * from public.${t}`), /permission denied/)
  }
})
await test("tableau des duels : Elo, rang, duels restants contre l'IA", async () => {
  const t = await valeur(E, 'select public.tableau_duels()')
  assert.equal(t.iaRestants, 5)
  assert.equal(t.rang >= 1, true)
  assert.equal(typeof t.enLigne, 'number')
})

console.log('Effacement du compte')
await test('supprimer son compte efface profil et cartes', async () => {
  await en(B, 'select public.supprimer_mon_compte()')
  assert.equal((await admin(`select count(*)::int as n from public.profils where id = '${B}'`)).rows[0].n, 0)
  assert.equal((await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${B}'`)).rows[0].n, 0)
})
await test('supprimer son compte anonymise ses messages et libère sa place de clan', async () => {
  await en(E, 'select public.supprimer_mon_compte()')
  const m = (await admin("select distinct pseudo, auteur from public.messages where texte = 'Bonjour le site'")).rows
  assert.deepEqual(m, [{ pseudo: 'Agent disparu', auteur: null }])
  assert.equal((await admin(`select count(*)::int as n from prive.membres_clan where joueur = '${E}'`)).rows[0].n, 0)
  assert.equal((await admin(`select count(*)::int as n from prive.amities where '${E}' in (de, vers)`)).rows[0].n, 0)
})

console.log(`\n${reussis} tests réussis${process.exitCode ? ', des échecs' : ''}.`)
