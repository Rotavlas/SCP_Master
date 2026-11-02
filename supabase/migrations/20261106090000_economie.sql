-- SCP Masters : l'économie se resserre.
--  1. Recycler et brûler rapporte au plus 3 000 crédits par jour à plein tarif (heure de Paris) ; au-delà, 20 % de
--     la valeur seulement. Vendre toute sa collection d'un coup ne finance plus une rafale de dossiers.
--  2. Le marché prélève 10 % sur chaque vente (au lieu de 5 %) : ces crédits sortent du jeu.
--  3. Un dossier au-dessus d'O5, le Dossier Apollyon : 4 000 crédits, un seul par semaine (remis à zéro le lundi),
--     quatre fiches épiques ou mieux et une Légendaire garantie, Mythiques bien plus probables.
-- Valeurs à garder synchronisées avec src/engine/boosters.ts (Apollyon, PLAFOND_RECYCLAGE) et src/engine/marche.ts
-- (FRAIS_VENTE). À exécuter dans le SQL Editor de Supabase, après 20261105090000_dossiers_par_jour.sql.

-- ---------------------------------------------------------------------------
-- 1. Plafond quotidien des crédits du recyclage et du brûlage
-- ---------------------------------------------------------------------------
create or replace function prive.gain_plafonne(p_joueur uuid, p_montant bigint) returns bigint
language plpgsql stable as $$
declare
  deja bigint;
  plein bigint;
begin
  select coalesce(sum(montant), 0) into deja from public.mouvements_credits
   where joueur = p_joueur and motif in ('recyclage', 'brulage') and montant > 0 and le >= prive.debut_du_jour();
  plein := greatest(0, least(p_montant, 3000 - deja));
  return plein + floor((p_montant - plein) * 0.2);
end $$;

create or replace function prive.recycler(p_joueur uuid, p_carte text) returns int
language plpgsql volatile as $$
declare
  libres int;
  recyclables int;
  a_recycler int;
  rarete int;
  gain int;
begin
  -- On garde toujours un exemplaire standard : une variante ne compte jamais comme l'exemplaire gardé
  select count(*) filter (where variante = 'std'),
         count(*) filter (where variante = 'std' and origine <> 'souvenir' and bloque_par is null)
    into libres, recyclables
    from public.exemplaires where proprietaire = p_joueur and carte_id = p_carte;
  a_recycler := greatest(least(recyclables, libres - 1), 0);
  if a_recycler = 0 then
    return 0;
  end if;
  select ra into rarete from public.cartes where id = p_carte;
  gain := prive.gain_plafonne(p_joueur, a_recycler * (array[5, 12, 35, 90, 300, 2500])[rarete + 1]);
  delete from public.exemplaires where id in (
    select id from public.exemplaires
    where proprietaire = p_joueur and carte_id = p_carte and variante = 'std' and origine <> 'souvenir' and bloque_par is null
    order by numero_serie desc nulls first
    limit a_recycler);
  update public.profils set credits = credits + gain where id = p_joueur;
  insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, gain, 'recyclage', p_carte);
  return gain;
end $$;

create or replace function public.bruler_lot(p_cartes text[], p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  carte text;
  total int;
  libres int;
  nombre int;
  valeur int;
  credite bigint;
  gain bigint := 0;
  detruits int := 0;
begin
  if p_mode not in ('un', 'doublons', 'tous') then
    raise exception 'Mode de brûlage inconnu';
  end if;
  if cardinality(p_cartes) > 500 then
    raise exception 'Trop de dossiers à la fois (500 au plus)';
  end if;
  perform 1 from public.profils where id = moi for update;
  for carte in select distinct c from unnest(coalesce(p_cartes, '{}')) c loop
    -- « Doublons » : on garde toujours un exemplaire standard (une variante ne compte pas comme l'exemplaire gardé)
    select count(*) filter (where variante = case when p_mode = 'doublons' then 'std' else variante end),
           count(*) filter (where variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir')
      into total, libres
      from public.exemplaires where proprietaire = moi and carte_id = carte;
    nombre := case p_mode when 'un' then least(libres, 1) when 'doublons' then least(libres, total - 1) else libres end;
    continue when nombre <= 0;
    select prive.valeur_brulage(c.ra, 'std') into valeur from public.cartes c where c.id = carte;
    delete from public.exemplaires where id in (
      select id from public.exemplaires
      where proprietaire = moi and carte_id = carte and variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir'
      order by numero_serie desc nulls last, obtenu_le desc
      limit nombre);
    credite := prive.gain_plafonne(moi, (nombre * valeur)::bigint);
    perform prive.crediter(moi, credite, 'brulage', carte || ':std');
    gain := gain + credite;
    detruits := detruits + nombre;
  end loop;
  perform prive.nettoyer_equipe(moi);
  return jsonb_build_object('gain', gain, 'detruits', detruits, 'profil', prive.profil_json(moi));
end $$;

create or replace function public.bruler(p_carte text, p_variante text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  ex uuid;
  gain int;
begin
  perform 1 from public.profils where id = moi for update;
  ex := prive.exemplaire_libre(moi, p_carte, p_variante);
  if ex is null then
    raise exception 'Aucun exemplaire libre à brûler (les souvenirs et les cartes en vente ou en échange ne se brûlent pas)';
  end if;
  select prive.valeur_brulage(c.ra, p_variante) into gain from public.cartes c where c.id = p_carte;
  gain := prive.gain_plafonne(moi, gain);
  delete from public.exemplaires where id = ex;
  perform prive.crediter(moi, gain, 'brulage', p_carte || ':' || p_variante);
  perform prive.nettoyer_equipe(moi);
  return jsonb_build_object('gain', gain, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Taxe du marché : 10 %
-- ---------------------------------------------------------------------------
create or replace function prive.regler_enchere(p_enchere uuid, p_achat_immediat boolean) returns void
language plpgsql volatile as $$
declare
  e public.encheres;
  frais bigint;
begin
  select * into e from public.encheres where id = p_enchere and statut = 'ouverte' for update;
  if not found then
    return;
  end if;
  if e.mise is null or e.encherisseur is null then
    update public.exemplaires set bloque_par = null where id = e.exemplaire;
    update public.encheres set statut = 'invendue', close_le = now() where id = e.id;
    return;
  end if;
  frais := ceil(e.mise * 0.10);
  perform prive.transferer(e.exemplaire, e.encherisseur, 'enchere');
  perform prive.crediter(e.vendeur, e.mise - frais, 'vente', e.id::text);
  insert into public.ventes (carte_id, variante, prix, achat_immediat) values (e.carte_id, e.variante, e.mise, p_achat_immediat);
  update public.encheres set statut = 'vendue', close_le = now(), fin = least(fin, now()) where id = e.id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Le Dossier Apollyon, un par semaine
-- ---------------------------------------------------------------------------
alter table prive.types_boosters add column if not exists par_semaine int;
insert into prive.types_boosters (id, prix, types, poids, poids_derniere, bonus_variante, depuis_stock, mythique, par_semaine)
select 'apollyon', 4000, types, '{0,0,0,0.85,0.15}', '{0,0,0,0,1}', 6, false, 0.012, 1
  from prive.types_boosters where id = 'o5'
on conflict (id) do update set prix = excluded.prix, poids = excluded.poids, poids_derniere = excluded.poids_derniere,
  bonus_variante = excluded.bonus_variante, mythique = excluded.mythique, par_semaine = excluded.par_semaine;

-- Lundi minuit, heure de Paris
create or replace function prive.debut_de_la_semaine() returns timestamptz
language sql stable as $$
  select date_trunc('week', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

create or replace function prive.achats_de_la_semaine(p_joueur uuid, p_type text) returns int
language sql stable as $$
  select count(*)::int from public.mouvements_credits
   where joueur = p_joueur and motif = 'booster' and reference = p_type and le >= prive.debut_de_la_semaine();
$$;

create or replace function public.ouvrir_booster(p_type text, p_depuis_stock boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  t prive.types_boosters;
  p public.profils;
  i int;
  rarete int;
  carte text;
  variante text;
  numero int;
  essai int;
  deja text[] := '{}';
  tirage jsonb := '[]'::jsonb;
  possedees text[];
begin
  select * into t from prive.types_boosters where id = p_type;
  if not found then
    raise exception 'Booster inconnu : %', p_type;
  end if;
  if p_depuis_stock and not t.depuis_stock then
    raise exception 'Ce booster ne s''obtient pas gratuitement';
  end if;

  perform prive.crediter_boosters(moi);
  select * into p from public.profils where id = moi for update;
  if p_depuis_stock and p.boosters <= 0 then
    raise exception 'Aucun dossier en stock';
  end if;
  if not p_depuis_stock and p.credits < t.prix then
    raise exception 'Crédits insuffisants';
  end if;
  -- Les dossiers Keter et O5 s'achètent en nombre limité par jour (heure de Paris)
  if not p_depuis_stock and t.par_jour is not null and prive.achats_du_jour(moi, p_type) >= t.par_jour then
    raise exception 'Limite du jour atteinte pour ce dossier (% par jour) : de nouveaux achats seront possibles à minuit', t.par_jour;
  end if;
  if not p_depuis_stock and t.par_semaine is not null and prive.achats_de_la_semaine(moi, p_type) >= t.par_semaine then
    raise exception 'Limite de la semaine atteinte pour ce dossier (% par semaine) : de nouveaux achats seront possibles lundi', t.par_semaine;
  end if;

  select coalesce(array_agg(distinct carte_id), '{}') into possedees from public.exemplaires where proprietaire = moi;

  for i in 1 .. 5 loop
    carte := null;
    -- Une Mythique, très rarement : toujours en version standard, numérotée dans l'ordre d'obtention
    if random() < t.mythique then
      select id into carte from public.cartes where ra = 5 and not id = any (deja) order by random() limit 1;
      variante := 'std';
    end if;
    if carte is null then
      rarete := prive.tirer_indice(case when i = 5 then t.poids_derniere else t.poids end);
      carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
      -- Évite deux fois la même carte dans un même dossier
      essai := 0;
      while carte = any (deja) and essai < 5 loop
        carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
        essai := essai + 1;
      end loop;
      variante := prive.tirer_variante(t.bonus_variante);
    end if;
    deja := deja || carte;
    numero := prive.prochain_numero(carte, variante);
    insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine)
      values (moi, carte, variante, numero, 'booster');
    tirage := tirage || jsonb_build_object('id', carte, 'v', variante, 'n', numero);
  end loop;

  update public.profils set
    boosters = case when p_depuis_stock then boosters - 1 else boosters end,
    credits = case when p_depuis_stock then credits else credits - t.prix end,
    xp = xp + 5,
    stats = jsonb_set(stats, '{boostersOuverts}', to_jsonb(coalesce((stats ->> 'boostersOuverts')::int, 0) + 1)),
    nouvelles = (select coalesce(array_agg(distinct n), '{}') from unnest(nouvelles || array(
      select x from unnest(deja) x where not x = any (possedees))) n),
    souhaits = (select coalesce(array_agg(s), '{}') from unnest(souhaits) s where not s = any (deja))
  where id = moi;

  if not p_depuis_stock then
    insert into public.mouvements_credits (joueur, montant, motif, reference) values (moi, -t.prix, 'booster', p_type);
  end if;
  insert into prive.tirages (joueur, type_booster, cartes) values (moi, p_type, tirage);

  return jsonb_build_object('cartes', tirage, 'profil', prive.profil_json(moi));
end $$;

-- Les achats encore possibles : {"keter": 2, "o5": 0, "apollyon": 1} (aujourd'hui, ou cette semaine pour Apollyon)
create or replace function public.achats_restants() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(id, case
           when par_jour is not null then greatest(0, par_jour - prive.achats_du_jour(prive.joueur(), id))
           else greatest(0, par_semaine - prive.achats_de_la_semaine(prive.joueur(), id)) end), '{}'::jsonb)
  from prive.types_boosters where par_jour is not null or par_semaine is not null;
$$;

-- Ce qu'il reste à gagner à plein tarif aujourd'hui en recyclant et en brûlant
create or replace function public.recyclage_restant() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select greatest(0, 3000 - coalesce(sum(montant), 0))::int from public.mouvements_credits
   where joueur = prive.joueur() and motif in ('recyclage', 'brulage') and montant > 0 and le >= prive.debut_du_jour();
$$;

revoke execute on function public.achats_restants(), public.recyclage_restant() from public, anon;
grant execute on function public.achats_restants(), public.recyclage_restant() to authenticated;
