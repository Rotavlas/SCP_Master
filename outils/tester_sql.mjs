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

console.log('Duels contre l\'IA')
await test("adversaire réservé à une accréditation plus haute refusé", async () => {
  await echoue(en(B, 'select public.debuter_duel(5)'), /Accréditation insuffisante/)
})
await test('un duel terminé trop vite ne rapporte rien', async () => {
  const id = await valeur(B, 'select public.debuter_duel(1)')
  const r = await valeur(B, "select public.terminer_duel($1, 'victoire', 5, 5)", [id])
  assert.equal(r.credits, 0)
  assert.equal(r.profil.stats.duels, 1)
})
await test('une victoire normale rapporte le gain calculé par le serveur', async () => {
  const id = await valeur(B, 'select public.debuter_duel(1)')
  await admin(`update prive.duels_ia set debut = now() - interval '2 minutes' where id = $1`, [id])
  const r = await valeur(B, "select public.terminer_duel($1, 'victoire', 3, 5)", [id])
  assert.equal(r.credits, 40 + 3 * 5)
  assert.equal(r.xp, 40)
  assert.equal(r.profil.meilleur_adversaire, 1)
})
await test('un duel ne se termine qu\'une fois, et seulement par son joueur', async () => {
  const id = await valeur(B, 'select public.debuter_duel(1)')
  await echoue(en(A, "select public.terminer_duel($1, 'victoire', 5, 5)", [id]), /introuvable/)
  await valeur(B, "select public.terminer_duel($1, 'defaite', 1, 5)", [id])
  await echoue(en(B, "select public.terminer_duel($1, 'victoire', 5, 5)", [id]), /déjà terminé/)
})
await test('résultat incohérent refusé', async () => {
  const id = await valeur(B, 'select public.debuter_duel(1)')
  await echoue(en(B, "select public.terminer_duel($1, 'victoire', 6, 5)", [id]), /invalide/)
})
await test('un seul duel ouvert à la fois : le précédent est perdu sans gain', async () => {
  const premier = await valeur(B, 'select public.debuter_duel(1)')
  const second = await valeur(B, 'select public.debuter_duel(1)')
  await admin(`update prive.duels_ia set debut = now() - interval '2 minutes' where id in ($1, $2)`, [premier, second])
  await echoue(en(B, "select public.terminer_duel($1, 'victoire', 5, 5)", [premier]), /déjà terminé/)
  assert.equal((await valeur(B, "select public.terminer_duel($1, 'victoire', 5, 5)", [second])).credits, 65)
})
await test('résultat vide refusé', async () => {
  const id = await valeur(B, 'select public.debuter_duel(1)')
  await echoue(en(B, 'select public.terminer_duel($1, null, null, null)', [id]), /invalide/)
})
await test('au-delà de 30 duels récompensés par jour, plus de gains', async () => {
  await admin(`insert into prive.duels_ia (joueur, niveau, debut, fin, credits) select '${B}', 1, now() - interval '1 hour', now() - interval '1 hour', 40 from generate_series(1, 30)`)
  const id = await valeur(B, 'select public.debuter_duel(1)')
  await admin(`update prive.duels_ia set debut = now() - interval '2 minutes' where id = $1`, [id])
  assert.equal((await valeur(B, "select public.terminer_duel($1, 'victoire', 5, 5)", [id])).credits, 0)
})

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

console.log('Effacement du compte')
await test('supprimer son compte efface profil et cartes', async () => {
  await en(B, 'select public.supprimer_mon_compte()')
  assert.equal((await admin(`select count(*)::int as n from public.profils where id = '${B}'`)).rows[0].n, 0)
  assert.equal((await admin(`select count(*)::int as n from public.exemplaires where proprietaire = '${B}'`)).rows[0].n, 0)
})

console.log(`\n${reussis} tests réussis${process.exitCode ? ', des échecs' : ''}.`)
