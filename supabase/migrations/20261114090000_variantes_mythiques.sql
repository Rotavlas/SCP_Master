-- SCP Masters : les Mythiques ont leurs variantes.
--  1. Deux variantes réservées aux Mythiques, qui jouent sur leur illustration en pleine page : Négatif (la scène
--     en négatif photographique) et Épreuve d'artiste (la scène au crayon, sur papier).
--  2. Une Mythique tirée d'un dossier peut sortir dans l'une de ces deux variantes, ou dans une variante ordinaire
--     (holographique, expurgée, archive, brèche, sceau O5), avec la même chance que les autres cartes du dossier.
--     Son numéro (1 à 50) reste commun à toutes ses variantes : l'édition limitée ne grandit pas.
-- À exécuter dans le SQL Editor de Supabase, après 20261113090000_numeros_mythiques.sql.

-- ---------------------------------------------------------------------------
-- 1. Les variantes connues
-- ---------------------------------------------------------------------------
-- Les contraintes qui listent les variantes (exemplaires, lignes d'échange) acceptent les deux nouvelles
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as t, conname
      from pg_constraint
     where contype = 'c' and pg_get_constraintdef(oid) like '%variante%' and pg_get_constraintdef(oid) like '%breche%'
       and pg_get_constraintdef(oid) not like '%negatif%'
  loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
    execute format('alter table %s add constraint %I check (variante in (%s))', c.t, c.conname,
                   (select string_agg(quote_literal(v), ', ') from unnest(array['std', 'holo', 'exp', 'arch', 'breche', 'o5', 'negatif', 'esquisse']) v));
  end loop;
end $$;

-- Chance qu'une Mythique sorte dans chacune de ses variantes propres ; sinon, le tirage ordinaire des variantes
create or replace function prive.tirer_variante_mythique(p_bonus float8) returns text
language plpgsql volatile as $$
declare
  x float8 := random();
begin
  if x < 0.05 then
    return 'negatif';
  elsif x < 0.09 then
    return 'esquisse';
  end if;
  return prive.tirer_variante(p_bonus);
end $$;

-- ---------------------------------------------------------------------------
-- 2. L'ouverture d'un dossier (la variante d'une Mythique ; le reste est inchangé)
-- ---------------------------------------------------------------------------
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
  mythique_numerotee boolean;
  essai int;
  deja text[] := '{}';
  tirage jsonb := '[]'::jsonb;
  possedees text[];
begin
  select * into t from prive.types_boosters where id = p_type;
  if not found then
    raise exception 'Booster inconnu : %', p_type;
  end if;
  -- Depuis le stock : le dossier gratuit, ou un dossier Keter offert (Rapport quotidien, piste d'accréditation)
  if p_depuis_stock and not t.depuis_stock and p_type <> 'keter' then
    raise exception 'Ce booster ne s''obtient pas gratuitement';
  end if;

  perform prive.crediter_boosters(moi);
  select * into p from public.profils where id = moi for update;
  if p_depuis_stock and p_type = 'keter' and p.keter_offerts <= 0 then
    raise exception 'Aucun dossier Keter offert';
  end if;
  if p_depuis_stock and p_type <> 'keter' and p.boosters <= 0 then
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
    mythique_numerotee := false;
    rarete := null;
    -- Une Mythique, très rarement : numérotée, en édition limitée (le numéro est commun à toutes ses variantes). Toutes celles
    -- encore disponibles épuisées : une Légendaire à la place
    if random() < t.mythique then
      select c.id into carte from public.cartes c
       where c.ra = 5 and not c.id = any (deja)
         and coalesce((select s.dernier from prive.compteurs_serie s where s.carte_id = c.id and s.variante = 'std'), 0) < prive.edition_mythique()
       order by random() limit 1;
      if carte is not null then
        numero := prive.numero_mythique(carte);
        if numero is null then
          -- Le dernier exemplaire vient de partir dans un autre dossier
          carte := null;
        else
          mythique_numerotee := true;
          -- Une Mythique peut sortir dans une variante : les siennes (Négatif, Épreuve d'artiste) ou les autres
          variante := prive.tirer_variante_mythique(t.bonus_variante);
        end if;
      end if;
      if carte is null then
        rarete := 4;
      end if;
    end if;
    if carte is null then
      rarete := coalesce(rarete, prive.tirer_indice(case when i = 5 then t.poids_derniere else t.poids end));
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
    if not mythique_numerotee then
      numero := prive.prochain_numero(carte, variante);
    end if;
    insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine)
      values (moi, carte, variante, numero, 'booster');
    tirage := tirage || jsonb_build_object('id', carte, 'v', variante, 'n', numero);
  end loop;

  update public.profils set
    boosters = case when p_depuis_stock and p_type <> 'keter' then boosters - 1 else boosters end,
    keter_offerts = case when p_depuis_stock and p_type = 'keter' then keter_offerts - 1 else keter_offerts end,
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

-- ---------------------------------------------------------------------------
-- 3. Les fonctions qui listent les variantes : cours d'une carte, échanges, variante affichée
-- ---------------------------------------------------------------------------
create or replace function public.cours_carte(p_carte text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  rarete int;
begin
  perform prive.clore_echeances();
  select ra into rarete from public.cartes where id = p_carte;
  if rarete is null then
    raise exception 'Carte inconnue';
  end if;
  return jsonb_build_object(
    'variantes', (
      select jsonb_object_agg(v, jsonb_build_object(
        'brulage', prive.valeur_brulage(rarete, v),
        'dernier', (select prix from public.ventes where carte_id = p_carte and variante = v order by le desc limit 1),
        'mediane7', (select percentile_disc(0.5) within group (order by prix) from public.ventes
                     where carte_id = p_carte and variante = v and le > now() - interval '7 days'),
        'min30', (select min(prix) from public.ventes where carte_id = p_carte and variante = v and le > now() - interval '30 days'),
        'max30', (select max(prix) from public.ventes where carte_id = p_carte and variante = v and le > now() - interval '30 days'),
        'volume30', (select count(*) from public.ventes where carte_id = p_carte and variante = v and le > now() - interval '30 days'),
        'points', coalesce((select jsonb_agg(jsonb_build_array(le, prix) order by le) from (
                    select le, prix from public.ventes where carte_id = p_carte and variante = v order by le desc limit 60) p), '[]'::jsonb),
        'enVente', (select count(*) from public.encheres where carte_id = p_carte and variante = v and statut = 'ouverte'),
        'libres', (select count(*) from public.exemplaires where proprietaire = moi and carte_id = p_carte and variante = v
                    and echangeable and bloque_par is null and origine <> 'souvenir'),
        'reserves', (select count(*) from public.exemplaires where proprietaire = moi and carte_id = p_carte and variante = v
                    and bloque_par is not null)))
      from unnest(array['std', 'holo', 'exp', 'arch', 'breche', 'o5', 'negatif', 'esquisse']) v));
end $$;

create or replace function public.proposer_echange(p_pseudo text, p_donne jsonb, p_demande jsonb, p_credits_donnes bigint, p_credits_demandes bigint, p_message text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  cible uuid;
  id_offre uuid := gen_random_uuid();
  ligne record;
  ex uuid;
  donnes int;
  demandes int;
begin
  select id into cible from public.profils where pseudo = p_pseudo;
  if cible is null then
    raise exception 'Agent introuvable';
  end if;
  if cible = moi then
    raise exception 'Impossible d''échanger avec soi-même';
  end if;
  if jsonb_typeof(coalesce(p_donne, '[]')) <> 'array' or jsonb_typeof(coalesce(p_demande, '[]')) <> 'array' then
    raise exception 'Offre invalide';
  end if;
  donnes := jsonb_array_length(coalesce(p_donne, '[]'));
  demandes := jsonb_array_length(coalesce(p_demande, '[]'));
  if donnes > 10 or demandes > 10 then
    raise exception 'Dix cartes au plus de chaque côté';
  end if;
  if coalesce(p_credits_donnes, 0) not between 0 and 10000000 or coalesce(p_credits_demandes, 0) not between 0 and 10000000 then
    raise exception 'Montant invalide';
  end if;
  -- Un échange va dans les deux sens : rien ne se donne sans contrepartie
  if (donnes = 0 and coalesce(p_credits_donnes, 0) = 0) or (demandes = 0 and coalesce(p_credits_demandes, 0) = 0) then
    raise exception 'Chaque côté de l''échange doit contenir au moins une carte ou des crédits';
  end if;
  perform 1 from public.profils where id = moi for update;
  if (select count(*) from public.offres where de = moi and statut = 'ouverte') >= 10 then
    raise exception 'Dix offres en attente au maximum';
  end if;

  insert into public.offres (id, de, a, credits_de, credits_a, message)
    values (id_offre, moi, cible, coalesce(p_credits_donnes, 0), coalesce(p_credits_demandes, 0), nullif(trim(p_message), ''));
  -- Les crédits proposés sont mis de côté jusqu'à la réponse
  if coalesce(p_credits_donnes, 0) > 0 then
    if (select credits from public.profils where id = moi) < p_credits_donnes then
      raise exception 'Crédits insuffisants';
    end if;
    perform prive.crediter(moi, -p_credits_donnes, 'echange_reserve', id_offre::text);
  end if;
  for ligne in select x ->> 'c' as c, coalesce(x ->> 'v', 'std') as v from jsonb_array_elements(coalesce(p_donne, '[]')) x loop
    ex := prive.exemplaire_libre(moi, ligne.c, ligne.v);
    if ex is null then
      raise exception 'Vous n''avez pas d''exemplaire libre de % (%)', ligne.c, ligne.v;
    end if;
    update public.exemplaires set bloque_par = id_offre where id = ex;
    insert into public.offres_lignes (offre, cote, carte_id, variante, exemplaire, numero_serie)
      select id_offre, 'de', carte_id, variante, id, numero_serie from public.exemplaires where id = ex;
  end loop;
  for ligne in select x ->> 'c' as c, coalesce(x ->> 'v', 'std') as v from jsonb_array_elements(coalesce(p_demande, '[]')) x loop
    if not exists (select 1 from public.cartes where id = ligne.c) or ligne.v not in ('std', 'holo', 'exp', 'arch', 'breche', 'o5', 'negatif', 'esquisse') then
      raise exception 'Carte demandée invalide';
    end if;
    insert into public.offres_lignes (offre, cote, carte_id, variante) values (id_offre, 'a', ligne.c, ligne.v);
  end loop;
  -- Le destinataire doit avoir de quoi répondre, au moment de l'offre
  if exists (
    select 1 from (select carte_id, variante, count(*) as n from public.offres_lignes where offre = id_offre and cote = 'a' group by 1, 2) d
    where n > (select count(*) from public.exemplaires x where x.proprietaire = cible and x.carte_id = d.carte_id
               and x.variante = d.variante and x.echangeable and x.bloque_par is null and x.origine <> 'souvenir')) then
    raise exception '% n''a pas ces cartes en exemplaires libres', p_pseudo;
  end if;
  return jsonb_build_object('id', id_offre, 'profil', prive.profil_json(moi));
end $$;

create or replace function public.maj_preferences(p jsonb) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  nouvelle_equipe text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Préférences invalides';
  end if;
  if pg_column_size(p) > 200000 then
    raise exception 'Préférences trop volumineuses';
  end if;
  if p ? 'equipe' then
    if jsonb_typeof(p -> 'equipe') <> 'array' or jsonb_array_length(p -> 'equipe') > 5 then
      raise exception 'Équipe invalide';
    end if;
    select coalesce(array_agg(e), '{}') into nouvelle_equipe from jsonb_array_elements_text(p -> 'equipe') e;
    if exists (
      select 1 from unnest(nouvelle_equipe) e
      where not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = e)) then
      raise exception 'Équipe invalide';
    end if;
    update public.profils set equipe = nouvelle_equipe where id = moi;
  end if;
  if p ? 'favoris' then
    update public.profils set favoris = prive.ids_valides(p -> 'favoris', 5000) where id = moi;
  end if;
  if p ? 'souhaits' then
    update public.profils set souhaits = prive.ids_valides(p -> 'souhaits', 2000) where id = moi;
  end if;
  if p ? 'nouvelles' then
    update public.profils set nouvelles = prive.ids_valides(p -> 'nouvelles', 5000) where id = moi;
  end if;
  if p ? 'affichage' and jsonb_typeof(p -> 'affichage') = 'object' then
    -- Variante affichée par carte : cartes du catalogue et variantes connues uniquement
    update public.profils set affichage = (
      select coalesce(jsonb_object_agg(a.key, a.value), '{}')
      from (select key, value from jsonb_each_text(p -> 'affichage') limit 5000) a
      join public.cartes c on c.id = a.key
      where a.value in ('std', 'holo', 'exp', 'arch', 'breche', 'o5', 'negatif', 'esquisse'))
    where id = moi;
  end if;
  if p ? 'langue' and p ->> 'langue' in ('vo', 'vf') then
    update public.profils set langue = p ->> 'langue' where id = moi;
  end if;
end $$;
