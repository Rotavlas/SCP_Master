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
    await admin(`select c.ra from jsonb_array_elements($1::jsonb) with ordinality t(carte, rang) join public.cartes c on c.id = t.carte ->> 'id' order by t.rang`, [
      JSON.stringify(r.cartes),
    ])
  ).rows.map((x) => x.ra)
  assert.ok(raretes.every((ra) => ra >= 2), `raretés ${raretes}`)
  assert.ok(raretes[4] >= 3, 'la dernière carte est au moins épique')
  const mouvement = (await en(A, "select montant from public.mouvements_credits where motif = 'booster'")).rows[0]
  assert.equal(Number(mouvement.montant), -1200)
})
await test('les cartes souhaitées sont retirées de la liste et les nouvelles signalées', async () => {
  const etat = await valeur(A, 'select public.mon_etat()')
  assert.ok(etat.profil.nouvelles.length > 0)
  await en(A, "select public.maj_preferences('{\"souhaits\": [\"scp-173\"]}')")
  await admin(`update public.profils set boosters = 1 where id = '${A}'`)
  // Le tirage est aléatoire : on vérifie que le souhait disparaît si et seulement si la carte est tombée
  const r = await valeur(A, "select public.ouvrir_booster('standard', true)")
  const tirees = r.cartes.map((c) => c.id)
  assert.equal(r.profil.souhaits.includes('scp-173'), !tirees.includes('scp-173'))
})
await test('boosters gratuits recrédités avec le temps, 10 au maximum', async () => {
  await admin(`update public.profils set boosters = 0, dernier_booster = now() - interval '35 minutes' where id = '${A}'`)
  assert.equal((await valeur(A, 'select public.mon_etat()')).profil.boosters, 3)
  await admin(`update public.profils set boosters = 0, dernier_booster = now() - interval '5 days' where id = '${A}'`)
  assert.equal((await valeur(A, 'select public.mon_etat()')).profil.boosters, 10)
})
await test('probabilités de rareté conformes au dossier standard (100 000 tirages)', async () => {
  const r = (await admin(`select prive.tirer_indice('{0.66,0.24,0.075,0.02,0.005}') as i, count(*)::int as n from generate_series(1, 100000) group by 1 order by 1`)).rows
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
  await echoue(en(A, `insert into public.exemplaires (proprietaire, carte_id, origine) values ('${A}', 'scp-173', 'booster')`), /row-level security|permission denied/)
})
await test('le schéma privé est inaccessible', async () => {
  await echoue(en(A, 'select * from prive.tirages'), /permission denied/)
})

console.log('Recyclage')
await test('recycle les doublons standard et garde un exemplaire', async () => {
  // Les boosters précédents sont aléatoires : on part d'une situation connue pour cette carte
  await admin(`delete from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)
  await admin(`insert into public.exemplaires (proprietaire, carte_id, numero_serie, origine) select '${A}', 'scp-096', 900 + g, 'booster' from generate_series(1, 3) g`)
  const avant = Number((await admin(`select credits from public.profils where id = '${A}'`)).rows[0].credits)
  const r = await valeur(A, "select public.recycler_doublons('scp-096')")
  const ra = (await admin("select ra from public.cartes where id = 'scp-096'")).rows[0].ra
  const deja = (await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)).rows[0].n
  assert.equal(deja, 1)
  assert.equal(r.gain, 2 * [5, 12, 35, 90, 300][ra])
  assert.equal(Number(r.profil.credits), avant + r.gain)
  const garde = (await admin(`select numero_serie from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)).rows[0].numero_serie
  assert.equal(garde, 901, 'le plus petit numéro de série est conservé')
})
await test('avec une variante rare, tous les standard sont recyclables', async () => {
  await admin(`insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine) values ('${A}', 'scp-096', 'holo', 900, 'booster')`)
  const r = await valeur(A, "select public.recycler_doublons('scp-096')")
  assert.ok(r.gain > 0)
  const restants = (await admin(`select variante from public.exemplaires where proprietaire = '${A}' and carte_id = 'scp-096'`)).rows
  assert.deepEqual(restants.map((x) => x.variante), ['holo'])
})

console.log('Cartes offertes')
await test("l'import de partie locale n'existe plus", async () => {
  await echoue(en(B, 'select public.importer_souvenir($1)', ['{"collection": {"scp-173": 50}}']), /does not exist/)
})
await test('les souvenirs déjà importés ne rapportent rien au recyclage', async () => {
  await admin(`insert into public.exemplaires (proprietaire, carte_id, origine, echangeable) select '${B}', 'scp-682', 'souvenir', false from generate_series(1, 4)`)
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
  const absente = (await admin(`select id from public.cartes c where not exists (select 1 from public.exemplaires x where x.proprietaire = '${A}' and x.carte_id = c.id) limit 1`)).rows[0].id
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
      joueur, carte, variante, origine === 'souvenir' ? null : serie++, origine, origine !== 'souvenir',
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
  const e = (await admin('select x.bloque_par, x.numero_serie, (select max(numero_serie) from public.exemplaires where proprietaire = $2 and carte_id = $3) as maxi from public.encheres e join public.exemplaires x on x.id = e.exemplaire where e.id = $1', [vente, A, 'scp-173'])).rows[0]
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
  assert.deepEqual(h.map((m) => [m.pseudo, Number(m.montant)]), [['Docteur Bravo', 120], ['Chercheur Charlie', 105], ['Docteur Bravo', 100]])
  assert.ok(h.every((m) => m.moi === false), "A n'a pas misé")
  assert.equal((await valeur(B, 'select public.historique_mises($1)', [vente]))[0].moi, true)
  const e = (await valeur(C, 'select public.marche()')).ouvertes.find((x) => x.id === vente)
  assert.equal(e.meneur, 'Docteur Bravo')
  await echoue(en(null, 'select public.historique_mises($1)', [vente]), /permission denied/)
})
await test("une vente qui a reçu une mise ne peut plus être retirée", async () => {
  await echoue(en(A, 'select public.annuler_enchere($1)', [vente]), /déjà reçu une mise/)
})
await test('à échéance : la carte part au meilleur enchérisseur, le vendeur touche la mise moins 5 %', async () => {
  const avant = await credits(A)
  await echoir(vente)
  const m = await valeur(A, 'select public.marche()')
  assert.ok(!m.ouvertes.some((e) => e.id === vente))
  assert.equal(await credits(A), avant + 120 - 6)
  const ex = (await admin('select x.proprietaire, x.origine, x.bloque_par from public.encheres e join public.exemplaires x on x.id = e.exemplaire where e.id = $1', [vente])).rows[0]
  assert.deepEqual(ex, { proprietaire: B, origine: 'enchere', bloque_par: null })
  assert.equal(await credits(B), 10000 - 120)
  assert.equal(m.historique[0].statut, 'vendue')
})
await test("le cours de la carte reflète la vente", async () => {
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
await test("sans mise, la carte revient à son vendeur ; on peut retirer une vente sans mise", async () => {
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
  await echoue(en(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\",\"v\":\"o5\"}]', '[{\"c\":\"scp-3000\"}]', 0, 0, null)"), /pas d'exemplaire libre/)
  await echoue(en(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\"}]', '[{\"c\":\"scp-002\"}]', 0, 0, null)"), /n'a pas ces cartes/)
  await echoue(en(A, "select public.proposer_echange('Docteur Bravo', '[]', '[{\"c\":\"scp-3000\"}]', 99999999, 0, null)"), /Montant invalide/)
})
let offre
await test("proposer réserve ses cartes et ses crédits", async () => {
  const avant = await credits(A)
  offre = (await valeur(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\"}]', '[{\"c\":\"scp-3000\"}]', 50, 0, 'Marché conclu ?')")).id
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
  const id = (await valeur(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\"}]', '[{\"c\":\"scp-5000\"}]', 0, 0, null)")).id
  // B met entre-temps sa carte en vente : elle n'est plus libre
  await valeur(B, "select public.mettre_aux_encheres('scp-5000', 'std', 100, 60, null)")
  await echoue(en(B, 'select public.repondre_echange($1, true)', [id]), /plus d'exemplaire libre/)
  assert.equal(await possede(A, 'scp-2000'), 1, "A garde sa carte")
  assert.equal((await admin('select statut from public.offres where id = $1', [id])).rows[0].statut, 'ouverte')
  await valeur(A, 'select public.annuler_echange($1)', [id])
  assert.equal((await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${A}' and bloque_par is not null`)).rows[0].n, 1, 'seule scp-682 reste en vente')
})
await test('refuser ou laisser expirer rend cartes et crédits', async () => {
  await donner(B, 'scp-6000', 2)
  const avant = await credits(A)
  const r = (await valeur(A, "select public.proposer_echange('Docteur Bravo', '[]', '[{\"c\":\"scp-6000\"}]', 30, 0, null)")).id
  await valeur(B, 'select public.repondre_echange($1, false)', [r])
  assert.equal(await credits(A), avant)
  const x = (await valeur(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\"}]', '[{\"c\":\"scp-6000\"}]', 30, 0, null)")).id
  await admin("update public.offres set expire_le = now() - interval '1 second' where id = $1", [x])
  await valeur(A, 'select public.mes_echanges()')
  assert.equal((await admin('select statut from public.offres where id = $1', [x])).rows[0].statut, 'expiree')
  assert.equal(await credits(A), avant)
  assert.equal((await admin('select count(*)::int as n from public.exemplaires where bloque_par = $1', [x])).rows[0].n, 0)
})
await test("mon_etat signale les exemplaires réservés et les offres reçues", async () => {
  const id = (await valeur(A, "select public.proposer_echange('Docteur Bravo', '[{\"c\":\"scp-2000\"}]', '[{\"c\":\"scp-6000\"}]', 0, 0, null)")).id
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
  const o = (await valeur(A, "select public.proposer_echange('Chercheur Charlie', '[{\"c\":\"scp-2000\"}]', '[]', 0, 0, null)").catch(() => null))
  assert.equal(o, null, 'offre sans contrepartie refusée')
  await donner(C, 'scp-7001', 1)
  const offreC = (await valeur(A, "select public.proposer_echange('Chercheur Charlie', '[{\"c\":\"scp-2000\"}]', '[{\"c\":\"scp-7001\"}]', 25, 0, null)")).id
  await en(C, 'select public.supprimer_mon_compte()')
  assert.equal(await credits(A), avant, 'mise et crédits de l\'offre rendus')
  assert.equal((await admin('select count(*)::int as n from public.exemplaires where bloque_par = $1', [offreC])).rows[0].n, 0)
})

console.log('Effacement du compte')
await test('supprimer son compte efface profil et cartes', async () => {
  await en(B, 'select public.supprimer_mon_compte()')
  assert.equal((await admin(`select count(*)::int as n from public.profils where id = '${B}'`)).rows[0].n, 0)
  assert.equal((await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${B}'`)).rows[0].n, 0)
})

console.log(`\n${reussis} tests réussis${process.exitCode ? ', des échecs' : ''}.`)
