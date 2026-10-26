-- SCP Masters, étape 1 du mode en ligne : comptes, collection et boosters tirés par le serveur.
-- Le serveur fait foi : le navigateur n'écrit jamais directement dans les tables de valeur
-- (crédits, exemplaires, boosters) ; il appelle les fonctions ci-dessous.
--
-- Les constantes du jeu (boosters, variantes, adversaires, accréditations) doivent rester
-- synchronisées avec src/engine/boosters.ts, src/engine/variantes.ts, src/engine/duel.ts
-- et src/state/sauvegarde.ts.

create schema if not exists prive;

-- ---------------------------------------------------------------------------
-- Catalogue : identifiants, type et rareté des cartes (rempli par supabase/catalogue.sql)
-- ---------------------------------------------------------------------------
create table public.cartes (
  id text primary key,
  k char(1) not null check (k in ('s', 'f', 'p', 'g', 'n', 'd', 'c')),
  ra smallint not null check (ra between 0 and 4)
);
create index cartes_tirage on public.cartes (k, ra);

create table prive.types_boosters (
  id text primary key,
  prix int not null,
  -- poids de chaque type de fiche, ex. {"s": 0.66, "c": 0.14}
  types jsonb not null,
  poids float8[] not null,
  poids_derniere float8[] not null,
  bonus_variante float8 not null,
  depuis_stock boolean not null default false
);

insert into prive.types_boosters values
  ('standard', 100, '{"s":0.66,"c":0.14,"d":0.05,"p":0.06,"f":0.04,"g":0.03,"n":0.02}',
   '{0.66,0.24,0.075,0.02,0.005}', '{0,0.7,0.22,0.065,0.015}', 1, true),
  ('scp', 120, '{"s":1}', '{0.66,0.24,0.075,0.02,0.005}', '{0,0.7,0.22,0.065,0.015}', 1, false),
  ('contes', 120, '{"c":0.75,"d":0.25}', '{0.66,0.24,0.075,0.02,0.005}', '{0,0.7,0.22,0.065,0.015}', 1, false),
  ('personnel', 160, '{"p":0.45,"f":0.3,"g":0.15,"n":0.1}', '{0.66,0.24,0.075,0.02,0.005}', '{0,0.7,0.22,0.065,0.015}', 1.5, false),
  ('keter', 350, '{"s":0.66,"c":0.14,"d":0.05,"p":0.06,"f":0.04,"g":0.03,"n":0.02}',
   '{0,0.68,0.24,0.065,0.015}', '{0,0,0.72,0.22,0.06}', 2, false),
  ('o5', 1200, '{"s":0.66,"c":0.14,"d":0.05,"p":0.06,"f":0.04,"g":0.03,"n":0.02}',
   '{0,0,0.72,0.22,0.06}', '{0,0,0,0.8,0.2}', 4, false);

create table prive.variantes (
  id text primary key,
  chance float8 not null
);
insert into prive.variantes values ('holo', 0.04), ('exp', 0.02), ('arch', 0.012), ('breche', 0.005), ('o5', 0.0015);

create table prive.adversaires (
  niveau smallint primary key,
  accreditation smallint not null,
  gain int not null,
  xp int not null
);
insert into prive.adversaires values (1, 0, 40, 40), (2, 1, 60, 60), (3, 2, 85, 90), (4, 3, 120, 130), (5, 4, 180, 200);

-- ---------------------------------------------------------------------------
-- Joueurs
-- ---------------------------------------------------------------------------
create table public.profils (
  id uuid primary key references auth.users on delete cascade,
  pseudo text unique check (pseudo ~ '^[[:alnum:]À-ÿ _.-]{3,24}$'),
  credits bigint not null default 200 check (credits >= 0),
  xp int not null default 0,
  boosters int not null default 3 check (boosters between 0 and 10),
  dernier_booster timestamptz not null default now(),
  meilleur_adversaire smallint not null default 0,
  stats jsonb not null default '{"duels":0,"victoires":0,"boostersOuverts":0,"bonnesReponses":0,"questions":0}',
  -- Préférences sans valeur marchande : le joueur les modifie via maj_preferences()
  equipe text[] not null default '{}',
  favoris text[] not null default '{}',
  souhaits text[] not null default '{}',
  nouvelles text[] not null default '{}',
  affichage jsonb not null default '{}',
  langue text not null default 'vo' check (langue in ('vo', 'vf')),
  souvenir_importe boolean not null default false,
  cree_le timestamptz not null default now()
);

-- Un exemplaire = une carte possédée, unique et traçable
create table public.exemplaires (
  id uuid primary key default gen_random_uuid(),
  proprietaire uuid not null references public.profils on delete cascade,
  carte_id text not null references public.cartes,
  variante text not null default 'std' check (variante in ('std', 'holo', 'exp', 'arch', 'breche', 'o5')),
  -- n-ième exemplaire tiré de cette carte et variante ; vide pour les souvenirs importés
  numero_serie int,
  origine text not null check (origine in ('booster', 'souvenir', 'recompense', 'echange', 'enchere', 'bourse')),
  echangeable boolean not null default true,
  -- offre, enchère ou ordre qui réserve l'exemplaire (étapes suivantes)
  bloque_par uuid,
  obtenu_le timestamptz not null default now(),
  unique (carte_id, variante, numero_serie)
);
create index exemplaires_proprietaire on public.exemplaires (proprietaire, carte_id);

create table prive.compteurs_serie (
  carte_id text not null,
  variante text not null,
  dernier int not null,
  primary key (carte_id, variante)
);

-- Grand livre : chaque mouvement de crédits est tracé
create table public.mouvements_credits (
  id bigserial primary key,
  joueur uuid not null references public.profils on delete cascade,
  montant bigint not null,
  motif text not null,
  reference text,
  le timestamptz not null default now()
);
create index mouvements_joueur on public.mouvements_credits (joueur, le desc);

-- Journal des tirages, pour pouvoir vérifier les probabilités annoncées
create table prive.tirages (
  id bigserial primary key,
  joueur uuid not null references public.profils on delete cascade,
  type_booster text not null,
  cartes jsonb not null,
  le timestamptz not null default now()
);

create table prive.duels_ia (
  id uuid primary key default gen_random_uuid(),
  joueur uuid not null references public.profils on delete cascade,
  niveau smallint not null,
  debut timestamptz not null default now(),
  fin timestamptz,
  issue text check (issue in ('victoire', 'defaite', 'nul')),
  bonnes smallint,
  credits int,
  xp int
);
create index duels_ia_joueur on prive.duels_ia (joueur, debut desc);

-- ---------------------------------------------------------------------------
-- Règles d'accès : lecture de ses propres lignes, aucune écriture directe
-- ---------------------------------------------------------------------------
alter table public.cartes enable row level security;
alter table public.profils enable row level security;
alter table public.exemplaires enable row level security;
alter table public.mouvements_credits enable row level security;

create policy "catalogue public" on public.cartes for select using (true);
create policy "son profil" on public.profils for select using (id = auth.uid());
create policy "ses exemplaires" on public.exemplaires for select using (proprietaire = auth.uid());
create policy "ses mouvements" on public.mouvements_credits for select using (joueur = auth.uid());

-- Défense en profondeur : en plus des règles RLS, aucune écriture directe sur les tables du jeu
revoke insert, update, delete, truncate on public.cartes, public.profils, public.exemplaires, public.mouvements_credits
  from anon, authenticated;
grant select on public.cartes to anon, authenticated;
grant select on public.profils, public.exemplaires, public.mouvements_credits to authenticated;

revoke all on schema prive from public;

-- ---------------------------------------------------------------------------
-- Outils internes
-- ---------------------------------------------------------------------------

-- Indice tiré selon des poids (0 pour le premier)
create function prive.tirer_indice(p float8[]) returns int
language plpgsql volatile as $$
declare
  total float8 := 0;
  x float8;
  i int;
begin
  for i in 1 .. array_length(p, 1) loop
    total := total + p[i];
  end loop;
  x := random() * total;
  for i in 1 .. array_length(p, 1) loop
    x := x - p[i];
    if x < 0 then
      return i - 1;
    end if;
  end loop;
  return 0;
end $$;

create function prive.tirer_type(p jsonb) returns char
language plpgsql volatile as $$
declare
  total float8;
  x float8;
  ligne record;
begin
  select sum(value::float8) into total from jsonb_each_text(p);
  x := random() * total;
  for ligne in select key, value::float8 as poids from jsonb_each_text(p) loop
    x := x - ligne.poids;
    if x < 0 then
      return ligne.key;
    end if;
  end loop;
  return 's';
end $$;

create function prive.tirer_carte(p_type char, p_rarete int) returns text
language plpgsql volatile as $$
declare
  nombre int;
  resultat text;
begin
  select count(*) into nombre from public.cartes where k = p_type and ra = p_rarete;
  if nombre = 0 then
    -- Type sans carte de cette rareté : n'importe quelle carte de la rareté
    select count(*) into nombre from public.cartes where ra = p_rarete;
    select id into resultat from public.cartes where ra = p_rarete offset floor(random() * nombre)::int limit 1;
    return resultat;
  end if;
  select id into resultat from public.cartes where k = p_type and ra = p_rarete offset floor(random() * nombre)::int limit 1;
  return resultat;
end $$;

create function prive.tirer_variante(p_bonus float8) returns text
language plpgsql volatile as $$
declare
  x float8 := random();
  v record;
begin
  for v in select id, chance from prive.variantes order by chance loop
    x := x - v.chance * p_bonus;
    if x < 0 then
      return v.id;
    end if;
  end loop;
  return 'std';
end $$;

create function prive.prochain_numero(p_carte text, p_variante text) returns int
language sql volatile as $$
  insert into prive.compteurs_serie as c (carte_id, variante, dernier) values (p_carte, p_variante, 1)
  on conflict (carte_id, variante) do update set dernier = c.dernier + 1
  returning dernier;
$$;

-- Boosters gratuits accumulés : un toutes les 10 minutes, 10 en stock au maximum
create function prive.crediter_boosters(p_joueur uuid) returns void
language plpgsql volatile as $$
declare
  p public.profils;
  gagnes int;
  total int;
begin
  select * into p from public.profils where id = p_joueur for update;
  if p.boosters >= 10 then
    update public.profils set dernier_booster = now() where id = p_joueur;
    return;
  end if;
  gagnes := floor(extract(epoch from now() - p.dernier_booster) / 600)::int;
  if gagnes <= 0 then
    return;
  end if;
  total := least(10, p.boosters + gagnes);
  update public.profils
     set boosters = total,
         dernier_booster = case when total >= 10 then now() else p.dernier_booster + gagnes * interval '10 minutes' end
   where id = p_joueur;
end $$;

create function prive.accreditation(p_xp int) returns int
language sql immutable as $$
  select count(*)::int - 1 from unnest(array[0, 150, 500, 1200, 2600, 5000]) as seuil where p_xp >= seuil;
$$;

create function prive.profil_json(p_joueur uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'pseudo', pseudo, 'credits', credits, 'xp', xp, 'boosters', boosters,
    'dernier_booster', dernier_booster, 'meilleur_adversaire', meilleur_adversaire, 'stats', stats,
    'equipe', equipe, 'favoris', favoris, 'souhaits', souhaits, 'nouvelles', nouvelles,
    'affichage', affichage, 'langue', langue, 'souvenir_importe', souvenir_importe)
  from public.profils where id = p_joueur;
$$;

create function prive.joueur() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  return auth.uid();
end $$;

-- Profil créé à l'inscription
create function prive.nouveau_joueur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profils (id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger profil_a_l_inscription after insert on auth.users
  for each row execute function prive.nouveau_joueur();

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le jeu
-- ---------------------------------------------------------------------------

-- État complet du joueur : profil et collection regroupée par carte et variante
create function public.mon_etat() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.crediter_boosters(moi);
  return jsonb_build_object(
    'profil', prive.profil_json(moi),
    'collection', coalesce((
      select jsonb_agg(jsonb_build_object('c', carte_id, 'v', variante, 'n', n, 's', souvenirs))
      from (
        select carte_id, variante, count(*) as n, count(*) filter (where origine = 'souvenir') as souvenirs
        from public.exemplaires where proprietaire = moi
        group by carte_id, variante
      ) regroupes), '[]'::jsonb));
end $$;

create function public.definir_pseudo(p_pseudo text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
begin
  update public.profils set pseudo = trim(p_pseudo) where id = moi;
  return prive.profil_json(moi);
exception when unique_violation then
  raise exception 'Ce pseudo est déjà pris' using errcode = '23505';
end $$;

create function public.ouvrir_booster(p_type text, p_depuis_stock boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  t prive.types_boosters;
  p public.profils;
  i int;
  rarete int;
  carte text;
  variante text;
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

  select coalesce(array_agg(distinct carte_id), '{}') into possedees from public.exemplaires where proprietaire = moi;

  for i in 1 .. 5 loop
    rarete := prive.tirer_indice(case when i = 5 then t.poids_derniere else t.poids end);
    carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
    -- Évite deux fois la même carte dans un même dossier
    essai := 0;
    while carte = any (deja) and essai < 5 loop
      carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
      essai := essai + 1;
    end loop;
    deja := deja || carte;
    variante := prive.tirer_variante(t.bonus_variante);
    insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine)
      values (moi, carte, variante, prive.prochain_numero(carte, variante), 'booster');
    tirage := tirage || jsonb_build_object('id', carte, 'v', variante);
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

-- Recycle les doublons standard d'une carte. On garde toujours au moins un exemplaire,
-- et les souvenirs importés ne rapportent rien (ils ne sont pas vérifiables).
create function prive.recycler(p_joueur uuid, p_carte text) returns int
language plpgsql volatile as $$
declare
  total int;
  recyclables int;
  a_recycler int;
  rarete int;
  gain int;
begin
  select count(*), count(*) filter (where variante = 'std' and origine <> 'souvenir' and bloque_par is null)
    into total, recyclables
    from public.exemplaires where proprietaire = p_joueur and carte_id = p_carte;
  a_recycler := case when total - recyclables >= 1 then recyclables else greatest(recyclables - 1, 0) end;
  if a_recycler = 0 then
    return 0;
  end if;
  select ra into rarete from public.cartes where id = p_carte;
  gain := a_recycler * (array[5, 12, 35, 90, 300])[rarete + 1];
  -- On garde les plus petits numéros de série, les plus prestigieux
  delete from public.exemplaires where id in (
    select id from public.exemplaires
    where proprietaire = p_joueur and carte_id = p_carte and variante = 'std' and origine <> 'souvenir' and bloque_par is null
    order by numero_serie desc nulls first
    limit a_recycler);
  update public.profils set credits = credits + gain where id = p_joueur;
  insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, gain, 'recyclage', p_carte);
  return gain;
end $$;

create function public.recycler_doublons(p_carte text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  gain int;
begin
  perform 1 from public.profils where id = moi for update;
  gain := prive.recycler(moi, p_carte);
  return jsonb_build_object('gain', gain, 'profil', prive.profil_json(moi));
end $$;

create function public.recycler_tous_les_doublons() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  gain int := 0;
  carte text;
begin
  perform 1 from public.profils where id = moi for update;
  for carte in select distinct carte_id from public.exemplaires where proprietaire = moi loop
    gain := gain + prive.recycler(moi, carte);
  end loop;
  return jsonb_build_object('gain', gain, 'profil', prive.profil_json(moi));
end $$;

-- Duels contre l'IA : ils se jouent dans le navigateur, le serveur ne peut donc pas tout vérifier.
-- Il impose une durée minimale, refuse les gains au-delà de 30 duels par jour, et calcule lui-même la récompense.
create function public.debuter_duel(p_niveau int) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  a prive.adversaires;
  id_duel uuid;
begin
  select * into a from prive.adversaires where niveau = p_niveau;
  if not found then
    raise exception 'Adversaire inconnu';
  end if;
  if a.accreditation > prive.accreditation((select xp from public.profils where id = moi)) then
    raise exception 'Accréditation insuffisante';
  end if;
  insert into prive.duels_ia (joueur, niveau) values (moi, p_niveau) returning id into id_duel;
  return id_duel;
end $$;

create function public.terminer_duel(p_duel uuid, p_issue text, p_bonnes int, p_questions int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  d prive.duels_ia;
  a prive.adversaires;
  credits_gagnes int;
  xp_gagne int;
  du_jour int;
begin
  select * into d from prive.duels_ia where id = p_duel and joueur = moi for update;
  if not found or d.fin is not null then
    raise exception 'Duel introuvable ou déjà terminé';
  end if;
  if p_issue not in ('victoire', 'defaite', 'nul') or p_questions not between 1 and 5 or p_bonnes not between 0 and p_questions then
    raise exception 'Résultat invalide';
  end if;
  select * into a from prive.adversaires where niveau = d.niveau;

  credits_gagnes := case p_issue when 'victoire' then a.gain + p_bonnes * 5 when 'nul' then round(a.gain / 3.0) else 10 end;
  xp_gagne := case p_issue when 'victoire' then a.xp when 'nul' then round(a.xp / 2.0) else 15 end;

  select count(*) into du_jour from prive.duels_ia
   where joueur = moi and fin > now() - interval '1 day' and credits > 0;
  -- Une partie de 5 manches prend plus de 15 secondes, même en répondant très vite
  if now() - d.debut < interval '15 seconds' or du_jour >= 30 then
    credits_gagnes := 0;
    xp_gagne := 0;
  end if;

  update prive.duels_ia set fin = now(), issue = p_issue, bonnes = p_bonnes, credits = credits_gagnes, xp = xp_gagne
   where id = p_duel;
  update public.profils set
    credits = credits + credits_gagnes,
    xp = xp + xp_gagne,
    meilleur_adversaire = case when p_issue = 'victoire' then greatest(meilleur_adversaire, d.niveau) else meilleur_adversaire end,
    stats = stats || jsonb_build_object(
      'duels', coalesce((stats ->> 'duels')::int, 0) + 1,
      'victoires', coalesce((stats ->> 'victoires')::int, 0) + case when p_issue = 'victoire' then 1 else 0 end,
      'questions', coalesce((stats ->> 'questions')::int, 0) + p_questions,
      'bonnesReponses', coalesce((stats ->> 'bonnesReponses')::int, 0) + p_bonnes)
  where id = moi;
  if credits_gagnes > 0 then
    insert into public.mouvements_credits (joueur, montant, motif, reference) values (moi, credits_gagnes, 'duel', p_duel::text);
  end if;
  return jsonb_build_object('credits', credits_gagnes, 'xp', xp_gagne, 'profil', prive.profil_json(moi));
end $$;

-- Préférences sans valeur : équipe, favoris, souhaits, cartes vues, variante affichée, langue
create function public.maj_preferences(p jsonb) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  nouvelle_equipe text[];
begin
  if pg_column_size(p) > 400000 then
    raise exception 'Préférences trop volumineuses';
  end if;
  if p ? 'equipe' then
    select coalesce(array_agg(e), '{}') into nouvelle_equipe from jsonb_array_elements_text(p -> 'equipe') e;
    if cardinality(nouvelle_equipe) > 5 or exists (
      select 1 from unnest(nouvelle_equipe) e
      where not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = e)) then
      raise exception 'Équipe invalide';
    end if;
    update public.profils set equipe = nouvelle_equipe where id = moi;
  end if;
  if p ? 'favoris' then
    update public.profils set favoris = (select coalesce(array_agg(e), '{}') from (select jsonb_array_elements_text(p -> 'favoris') e limit 5000) f) where id = moi;
  end if;
  if p ? 'souhaits' then
    update public.profils set souhaits = (select coalesce(array_agg(e), '{}') from (select jsonb_array_elements_text(p -> 'souhaits') e limit 2000) f) where id = moi;
  end if;
  if p ? 'nouvelles' then
    update public.profils set nouvelles = (select coalesce(array_agg(e), '{}') from (select jsonb_array_elements_text(p -> 'nouvelles') e limit 5000) f) where id = moi;
  end if;
  if p ? 'affichage' and jsonb_typeof(p -> 'affichage') = 'object' then
    update public.profils set affichage = p -> 'affichage' where id = moi;
  end if;
  if p ? 'langue' and p ->> 'langue' in ('vo', 'vf') then
    update public.profils set langue = p ->> 'langue' where id = moi;
  end if;
end $$;

-- Import unique de la partie locale, en « souvenir » : non échangeable, non recyclable, sans numéro de série.
-- p = {"collection": {"scp-173": 2}, "variantes": {"scp-173": {"holo": 1}}}
create function public.importer_souvenir(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  moi uuid := prive.joueur();
  ligne record;
  variante record;
  rares int;
  nombre int;
  total int := 0;
begin
  perform 1 from public.profils where id = moi for update;
  if (select souvenir_importe from public.profils where id = moi) then
    raise exception 'Partie locale déjà importée';
  end if;
  for ligne in
    select c.key as carte, least(c.value::int, 50) as n
    from jsonb_each_text(coalesce(p -> 'collection', '{}')) c
    join public.cartes on cartes.id = c.key
    where c.value ~ '^[0-9]+$'
  loop
    rares := 0;
    for variante in
      select v.key as id, least(v.value::int, ligne.n) as n
      from jsonb_each_text(coalesce(p -> 'variantes' -> ligne.carte, '{}')) v
      where v.key in ('holo', 'exp', 'arch', 'breche', 'o5') and v.value ~ '^[0-9]+$'
    loop
      nombre := least(variante.n, ligne.n - rares);
      if nombre > 0 then
        insert into public.exemplaires (proprietaire, carte_id, variante, origine, echangeable)
          select moi, ligne.carte, variante.id, 'souvenir', false from generate_series(1, nombre);
        rares := rares + nombre;
      end if;
    end loop;
    if ligne.n - rares > 0 then
      insert into public.exemplaires (proprietaire, carte_id, variante, origine, echangeable)
        select moi, ligne.carte, 'std', 'souvenir', false from generate_series(1, ligne.n - rares);
    end if;
    total := total + ligne.n;
    exit when total >= 20000;
  end loop;
  update public.profils set souvenir_importe = true where id = moi;
  return jsonb_build_object('importees', total);
end $$;

-- Droit à l'effacement : supprime le compte et tout ce qui s'y rattache
create function public.supprimer_mon_compte() returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  delete from auth.users where id = prive.joueur();
  return true;
end $$;

-- Seuls les joueurs connectés appellent les fonctions du jeu
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.mon_etat(), public.definir_pseudo(text), public.ouvrir_booster(text, boolean),
  public.recycler_doublons(text), public.recycler_tous_les_doublons(), public.debuter_duel(int),
  public.terminer_duel(uuid, text, int, int), public.maj_preferences(jsonb), public.importer_souvenir(jsonb),
  public.supprimer_mon_compte()
to authenticated;
