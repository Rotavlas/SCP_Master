-- SCP Masters : rareté tenue, et de quoi revenir chaque jour.
--  1. Mythiques en édition limitée : chaque Mythique n'existe qu'en 50 exemplaires numérotés, pour toute la vie du
--     jeu. Épuisée, elle ne sort plus des dossiers (le tirage donne une Légendaire) et ne circule plus qu'au marché ;
--     une Mythique brûlée ne libère pas son numéro. `select * from prive.rarete();` dans le SQL Editor pour suivre
--     la circulation des Légendaires et des Mythiques.
--  2. Dossiers Keter offerts (profils.keter_offerts) : ouverts depuis la réserve, hors limite d'achat du jour.
--  3. Rapport quotidien : une récompense par jour sur un cycle de 7 (le 7e, un dossier Keter). Un jour manqué et la
--     série repart de zéro.
--  4. Piste d'accréditation : 30 paliers d'XP, chacun avec sa récompense, à réclamer une fois.
--  5. Fil du clan : ce que les membres ont fait ces 7 derniers jours.
--  6. Objectifs presque atteints : ce qui est à portée de main, pour l'accueil.
-- À exécuter dans le SQL Editor de Supabase, après 20261110090000_notifications_epreuve_raid.sql.

-- ---------------------------------------------------------------------------
-- 1. Mythiques en édition limitée
-- ---------------------------------------------------------------------------
create or replace function prive.edition_mythique() returns int language sql immutable as $$ select 50 $$;

-- Le prochain numéro d'une Mythique, ou null si son édition est épuisée (atomique : deux dossiers ouverts au même
-- instant ne peuvent pas dépasser la limite)
create or replace function prive.numero_mythique(p_carte text) returns int
language sql volatile as $$
  insert into prive.compteurs_serie as c (carte_id, variante, dernier) values (p_carte, 'std', 1)
  on conflict (carte_id, variante) do update set dernier = c.dernier + 1 where c.dernier < prive.edition_mythique()
  returning dernier;
$$;

-- Pour le SQL Editor : chaque Légendaire et Mythique en circulation (exemplaires, détenteurs), et pour les Mythiques,
-- combien ont été émis et combien restent à sortir
create or replace function prive.rarete()
returns table (rarete int, carte text, emis int, restants int, en_circulation int, detenteurs int)
language sql stable as $$
  select c.ra::int, c.id,
         case when c.ra = 5 then coalesce((select s.dernier from prive.compteurs_serie s where s.carte_id = c.id and s.variante = 'std'), 0) end,
         case when c.ra = 5 then prive.edition_mythique() - coalesce((select s.dernier from prive.compteurs_serie s where s.carte_id = c.id and s.variante = 'std'), 0) end,
         (select count(*) from public.exemplaires x where x.carte_id = c.id)::int,
         (select count(distinct x.proprietaire) from public.exemplaires x where x.carte_id = c.id)::int
    from public.cartes c
   where c.ra >= 4
   order by c.ra desc, 5 desc;
$$;

-- Pour les joueurs : l'édition de chaque Mythique (émis, restants)
create or replace function public.editions_mythiques() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(c.id, jsonb_build_object(
           'emis', coalesce(s.dernier, 0), 'total', prive.edition_mythique())), '{}'::jsonb)
    from public.cartes c left join prive.compteurs_serie s on s.carte_id = c.id and s.variante = 'std'
   where c.ra = 5;
$$;

-- ---------------------------------------------------------------------------
-- 2. Dossiers Keter offerts
-- ---------------------------------------------------------------------------
alter table public.profils add column if not exists keter_offerts int not null default 0 check (keter_offerts >= 0);

create or replace function prive.profil_json(p_joueur uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'pseudo', pseudo, 'credits', credits, 'xp', xp, 'boosters', boosters,
    'dernier_booster', dernier_booster, 'meilleur_adversaire', meilleur_adversaire, 'stats', stats,
    'equipe', equipe, 'favoris', favoris, 'souhaits', souhaits, 'nouvelles', nouvelles,
    'affichage', affichage, 'langue', langue, 'souvenir_importe', souvenir_importe, 'keter_offerts', keter_offerts)
  from public.profils where id = p_joueur;
$$;

-- L'ouverture d'un dossier : Mythiques en édition limitée, dossiers Keter offerts (le reste est inchangé)
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
    -- Une Mythique, très rarement : toujours en version standard, numérotée, en édition limitée. Toutes celles
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
          variante := 'std';
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
-- 3. Rapport quotidien
-- ---------------------------------------------------------------------------
create table if not exists prive.rapports (
  joueur uuid primary key references public.profils on delete cascade,
  -- Jours d'affilée réclamés ; le jour du cycle en découle (1 à 7)
  serie int not null default 0,
  dernier date
);
alter table prive.rapports enable row level security;

-- Les récompenses du cycle : [jour, crédits, dossiers, Keter offerts]
create or replace function prive.recompenses_rapport()
returns table (jour int, credits int, dossiers int, keter int)
language sql immutable as $$
  values (1, 100, 0, 0), (2, 150, 0, 0), (3, 0, 1, 0), (4, 250, 0, 0), (5, 0, 2, 0), (6, 400, 0, 0), (7, 0, 0, 1)
$$;

create or replace function prive.aujourdhui() returns date
language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- La série encore valable : réclamée hier ou aujourd'hui, sinon perdue
create or replace function prive.serie_rapport(p_joueur uuid) returns int
language sql stable as $$
  select coalesce((select case when r.dernier >= prive.aujourdhui() - 1 then r.serie else 0 end
                     from prive.rapports r where r.joueur = p_joueur), 0);
$$;

create or replace function public.rapport() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with r as (
    select prive.serie_rapport(prive.joueur()) as serie,
           coalesce((select dernier = prive.aujourdhui() from prive.rapports where joueur = prive.joueur()), false) as fait
  )
  select jsonb_build_object(
    'serie', r.serie,
    'fait', r.fait,
    -- Le jour du cycle à réclamer (ou réclamé aujourd'hui)
    'jour', case when r.fait then (r.serie - 1) % 7 + 1 else r.serie % 7 + 1 end,
    'recompenses', (select jsonb_agg(to_jsonb(x) order by x.jour) from prive.recompenses_rapport() x))
  from r;
$$;

create or replace function public.reclamer_rapport() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  serie int;
  j int;
  rec record;
begin
  perform 1 from public.profils where id = moi for update;
  if exists (select 1 from prive.rapports where joueur = moi and dernier = prive.aujourdhui()) then
    raise exception 'Rapport déjà remis aujourd’hui : revenez demain';
  end if;
  serie := prive.serie_rapport(moi) + 1;
  j := (serie - 1) % 7 + 1;
  insert into prive.rapports (joueur, serie, dernier) values (moi, serie, prive.aujourdhui())
  on conflict (joueur) do update set serie = excluded.serie, dernier = excluded.dernier;
  select * into rec from prive.recompenses_rapport() x where x.jour = j;
  if rec.credits > 0 then
    perform prive.crediter(moi, rec.credits, 'rapport', j::text);
  end if;
  update public.profils set boosters = boosters + rec.dossiers, keter_offerts = keter_offerts + rec.keter where id = moi;
  return jsonb_build_object('profil', prive.profil_json(moi), 'rapport', public.rapport(), 'jour', j);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Piste d'accréditation
-- ---------------------------------------------------------------------------
create table if not exists prive.pistes (
  joueur uuid primary key references public.profils on delete cascade,
  -- Dernier palier réclamé
  palier int not null default 0
);
alter table prive.pistes enable row level security;

-- Les 30 paliers : l'XP requise grimpe de plus en plus (le 10e vers 6 300 XP, le 30e vers 45 500), la récompense aussi
create or replace function prive.paliers_piste()
returns table (palier int, xp int, credits int, dossiers int, keter int)
language sql immutable as $$
  select n, (round(100 * power(n, 1.8) / 10) * 10)::int, 50 + 15 * n,
         case when n % 3 = 0 then 1 else 0 end, case when n % 10 = 0 then 1 else 0 end
    from generate_series(1, 30) n;
$$;

create or replace function public.piste() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'xp', p.xp,
    'reclame', coalesce((select palier from prive.pistes where joueur = p.id), 0),
    'atteint', (select coalesce(max(x.palier), 0) from prive.paliers_piste() x where x.xp <= p.xp),
    'paliers', (select jsonb_agg(to_jsonb(x) order by x.palier) from prive.paliers_piste() x))
  from public.profils p where p.id = prive.joueur();
$$;

-- Réclame d'un coup tous les paliers atteints et pas encore réclamés
create or replace function public.reclamer_piste() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  xp_joueur int;
  deja int;
  gains record;
begin
  select xp into xp_joueur from public.profils where id = moi for update;
  deja := coalesce((select palier from prive.pistes where joueur = moi), 0);
  select coalesce(max(palier), 0) as jusqua, coalesce(sum(credits), 0)::int as credits, coalesce(sum(dossiers), 0)::int as dossiers,
         coalesce(sum(keter), 0)::int as keter
    into gains
    from prive.paliers_piste() where palier > deja and xp <= xp_joueur;
  if gains.jusqua <= deja then
    raise exception 'Aucun palier à réclamer : continuez à gagner de l’XP';
  end if;
  insert into prive.pistes (joueur, palier) values (moi, gains.jusqua)
  on conflict (joueur) do update set palier = excluded.palier;
  perform prive.crediter(moi, gains.credits, 'piste', gains.jusqua::text);
  update public.profils set boosters = boosters + gains.dossiers, keter_offerts = keter_offerts + gains.keter where id = moi;
  return jsonb_build_object('profil', prive.profil_json(moi), 'piste', public.piste(),
                            'gains', jsonb_build_object('paliers', gains.jusqua - deja, 'credits', gains.credits, 'dossiers', gains.dossiers, 'keter', gains.keter));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Fil du clan
-- ---------------------------------------------------------------------------
-- Les dossiers ouverts d'un joueur, par date : missions, fil du clan et tableau de bord les parcourent
create index if not exists tirages_joueur on prive.tirages (joueur, le desc);

create or replace function public.fil_clan() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with mon_clan as (
    select clan from prive.membres_clan where joueur = prive.joueur()
  ), membres as (
    select m.joueur, p.pseudo, m.rejoint_le from prive.membres_clan m join public.profils p on p.id = m.joueur
     where m.clan = (select clan from mon_clan)
  ), evenements as (
    -- Légendaires et Mythiques tirées
    select t.le, jsonb_build_object('type', 'tirage', 'pseudo', m.pseudo, 'carte', el->>'id', 'numero', (el->>'n')::int) as e
      from prive.tirages t join membres m on m.joueur = t.joueur
      cross join jsonb_array_elements(t.cartes) el
      join public.cartes c on c.id = el->>'id'
     where t.le >= now() - interval '7 days' and c.ra >= 4
    union all
    -- Victoires entre agents
    select j.maj_le, jsonb_build_object('type', 'victoire', 'pseudo', m.pseudo, 'classe', j.classe,
                                        'contre', (select pseudo from public.profils where id = case when j.joueur_a = m.joueur then j.joueur_b else j.joueur_a end))
      from public.duels_jcj j join membres m on m.joueur = j.gagnant
     where j.statut = 'termine' and j.maj_le >= now() - interval '7 days'
    union all
    -- Épreuves terminées
    select e.fin, jsonb_build_object('type', 'epreuve', 'pseudo', m.pseudo, 'score', e.score)
      from prive.epreuves e join membres m on m.joueur = e.joueur
     where e.termine and e.fin >= now() - interval '7 days'
    union all
    -- Pages d'album complétées
    select a.le, jsonb_build_object('type', 'album', 'pseudo', m.pseudo, 'page', (select titre from prive.pages_album() x where x.id = a.album))
      from prive.albums_reclames a join membres m on m.joueur = a.joueur
     where a.le >= now() - interval '7 days'
    union all
    -- Raid reconfiné
    select r.le, jsonb_build_object('type', 'raid', 'carte', prive.cible_raid(r.semaine))
      from prive.raids_annonces r
     where r.clan = (select clan from mon_clan) and r.le >= now() - interval '7 days'
    union all
    -- Arrivées
    select m.rejoint_le, jsonb_build_object('type', 'arrivee', 'pseudo', m.pseudo)
      from membres m
     where m.rejoint_le >= now() - interval '7 days'
  )
  select case when (select clan from mon_clan) is null then null else
    coalesce((select jsonb_agg(x.e || jsonb_build_object('le', x.le) order by x.le desc)
                from (select * from evenements order by le desc limit 30) x), '[]'::jsonb) end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Objectifs presque atteints
-- ---------------------------------------------------------------------------
-- Ce qui est à portée de main : rapport du jour, paliers, pages d'album aux deux tiers, part du raid, missions
-- avancées, Épreuve pas encore passée. Le client en montre quelques-uns sur l'accueil.
create or replace function public.objectifs_proches() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  o jsonb := '[]'::jsonb;
  r jsonb;
  pi jsonb;
  raid jsonb;
  x record;
begin
  r := public.rapport();
  if not (r->>'fait')::boolean then
    o := o || jsonb_build_object('type', 'rapport', 'jour', (r->>'jour')::int, 'serie', (r->>'serie')::int);
  end if;

  pi := public.piste();
  if (pi->>'atteint')::int > (pi->>'reclame')::int then
    o := o || jsonb_build_object('type', 'piste_prete', 'paliers', (pi->>'atteint')::int - (pi->>'reclame')::int);
  else
    select * into x from prive.paliers_piste() p where p.palier = (pi->>'atteint')::int + 1;
    if found then
      o := o || jsonb_build_object('type', 'piste', 'palier', x.palier, 'manque', x.xp - (pi->>'xp')::int);
    end if;
  end if;

  for x in
    select a->>'titre' as titre, (a->>'total')::int as total, (a->>'possedees')::int as possedees
      from jsonb_array_elements(public.albums()) a
     where not (a->>'reclame')::boolean and (a->>'possedees')::int * 3 >= (a->>'total')::int * 2
     order by (a->>'possedees')::float / (a->>'total')::int desc
     limit 2
  loop
    o := o || jsonb_build_object('type', case when x.possedees >= x.total then 'album_pret' else 'album' end,
                                 'titre', x.titre, 'manque', x.total - x.possedees);
  end loop;

  raid := public.raid();
  if raid is not null then
    if (raid->'courant'->>'vaincue')::boolean and not (raid->'courant'->>'reclame')::boolean
       and (raid->'courant'->>'moi')::int >= (raid->>'requis')::int then
      o := o || jsonb_build_object('type', 'raid_pret', 'carte', raid->'courant'->>'cible');
    elsif not (raid->'courant'->>'vaincue')::boolean and (raid->'courant'->>'moi')::int < (raid->>'requis')::int then
      o := o || jsonb_build_object('type', 'raid', 'carte', raid->'courant'->>'cible', 'manque', (raid->>'requis')::int - (raid->'courant'->>'moi')::int);
    end if;
  end if;

  for x in
    select m->>'titre' as titre, (m->>'objectif')::int as objectif, (m->>'progres')::int as progres
      from jsonb_array_elements(public.missions()) m
     where not (m->>'reclamee')::boolean and (m->>'progres')::int * 2 >= (m->>'objectif')::int
     order by (m->>'progres')::float / (m->>'objectif')::int desc
     limit 2
  loop
    o := o || jsonb_build_object('type', case when x.progres >= x.objectif then 'mission_prete' else 'mission' end,
                                 'titre', x.titre, 'manque', x.objectif - x.progres);
  end loop;

  if not exists (select 1 from prive.epreuves where joueur = moi and semaine = prive.semaine_courante()) then
    o := o || jsonb_build_object('type', 'epreuve');
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function public.editions_mythiques(), public.rapport(), public.reclamer_rapport(), public.piste(), public.reclamer_piste(),
  public.fil_clan(), public.objectifs_proches() from public, anon;
grant execute on function public.editions_mythiques(), public.rapport(), public.reclamer_rapport(), public.piste(), public.reclamer_piste(),
  public.fil_clan(), public.objectifs_proches() to authenticated;
