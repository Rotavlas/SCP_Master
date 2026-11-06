-- SCP Masters : la guerre de clans. Chaque semaine, les clans sont appariés deux à deux au hasard ; le score d'un clan
-- vient de l'activité de ses membres pendant la semaine (depuis leur arrivée) : 1 point par victoire contre l'IA,
-- 3 par victoire entre agents, 2 par Épreuve terminée. Le clan qui l'emporte gagne la guerre ; chacun de ses membres
-- qui y a marqué au moins un point réclame un titre (une seule fois : « Vétéran des guerres de clans ») et compte la
-- victoire dans son dossier. Aucun crédit, aucun dossier.
-- Pas de tâche planifiée : l'appariement de la semaine se fait à la première consultation.
-- À exécuter dans le SQL Editor de Supabase, après 20261122090000_statistiques.sql.

create table if not exists prive.guerres (
  semaine text not null,
  clan uuid not null references prive.clans on delete cascade,
  -- Pas d'adversaire : nombre impair de clans, ou clan fondé après l'appariement
  adversaire uuid references prive.clans on delete set null,
  primary key (semaine, clan)
);
alter table prive.guerres enable row level security;

create table if not exists prive.guerres_reclamees (
  joueur uuid not null references public.profils on delete cascade,
  semaine text not null,
  le timestamptz not null default now(),
  primary key (joueur, semaine)
);
alter table prive.guerres_reclamees enable row level security;

insert into prive.cosmetiques (id, type, prix, ordre) values ('titre-guerre', 'titre', null, 210)
on conflict (id) do update set type = excluded.type, prix = excluded.prix, ordre = excluded.ordre;

-- Les points d'un clan (ou d'un seul membre) pendant une semaine
create or replace function prive.points_guerre(p_clan uuid, p_semaine text, p_joueur uuid default null) returns int
language sql stable as $$
  with bornes as (
    select (p_semaine::date)::timestamp at time zone 'Europe/Paris' as debut,
           (p_semaine::date + 7)::timestamp at time zone 'Europe/Paris' as fin
  ), membres as (
    select m.joueur, greatest(m.rejoint_le, b.debut) as depuis, b.fin
      from prive.membres_clan m, bornes b
     where m.clan = p_clan and (p_joueur is null or m.joueur = p_joueur)
  )
  select (coalesce((select count(*) from prive.duels_ia d join membres m on m.joueur = d.joueur
                     where d.issue = 'victoire' and d.fin >= m.depuis and d.fin < m.fin), 0)
        + 3 * coalesce((select count(*) from public.duels_jcj j join membres m on m.joueur = j.gagnant
                         where j.statut = 'termine' and j.maj_le >= m.depuis and j.maj_le < m.fin), 0)
        + 2 * coalesce((select count(*) from prive.epreuves e join membres m on m.joueur = e.joueur
                         where e.semaine = p_semaine and e.termine and e.fin >= m.depuis), 0))::int;
$$;

-- L'appariement de la semaine, une fois pour toutes (le premier qui consulte le déclenche)
create or replace function prive.apparier_guerres(p_semaine text) returns void
language plpgsql volatile as $$
declare
  clans uuid[];
  i int;
begin
  if exists (select 1 from prive.guerres where semaine = p_semaine) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('scp-masters-guerres:' || p_semaine));
  if exists (select 1 from prive.guerres where semaine = p_semaine) then
    return;
  end if;
  select array_agg(id order by random()) into clans
    from prive.clans c where exists (select 1 from prive.membres_clan m where m.clan = c.id);
  if clans is null then
    return;
  end if;
  i := 1;
  while i <= cardinality(clans) loop
    if i + 1 <= cardinality(clans) then
      insert into prive.guerres (semaine, clan, adversaire) values (p_semaine, clans[i], clans[i + 1]), (p_semaine, clans[i + 1], clans[i]);
    else
      insert into prive.guerres (semaine, clan, adversaire) values (p_semaine, clans[i], null);
    end if;
    i := i + 2;
  end loop;
end $$;

-- Une guerre vue par un clan
create or replace function prive.etat_guerre(p_clan uuid, p_joueur uuid, p_semaine text) returns jsonb
language sql stable as $$
  with g as (select adversaire from prive.guerres where semaine = p_semaine and clan = p_clan),
  s as (
    select prive.points_guerre(p_clan, p_semaine) as nous,
           case when (select adversaire from g) is null then null else prive.points_guerre((select adversaire from g), p_semaine) end as eux
  )
  select case when not exists (select 1 from g) then null else jsonb_build_object(
    'semaine', p_semaine,
    'adversaire', (select jsonb_build_object('nom', c.nom, 'tag', c.tag) from prive.clans c where c.id = (select adversaire from g)),
    'nous', (select nous from s),
    'eux', (select eux from s),
    'moi', prive.points_guerre(p_clan, p_semaine, p_joueur),
    'reclame', exists (select 1 from prive.guerres_reclamees r where r.joueur = p_joueur and r.semaine = p_semaine)) end;
$$;

create or replace function public.guerre_clan() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  le_clan uuid;
begin
  select clan into le_clan from prive.membres_clan where joueur = moi;
  if le_clan is null then
    return null;
  end if;
  perform prive.apparier_guerres(prive.semaine_courante());
  return jsonb_build_object(
    'fin', prive.debut_de_la_semaine() + interval '7 days',
    'victoires', coalesce((select (stats ->> 'guerres')::int from public.profils where id = moi), 0),
    'courante', prive.etat_guerre(le_clan, moi, prive.semaine_courante()),
    'precedente', prive.etat_guerre(le_clan, moi, prive.semaine_precedente()));
end $$;

-- La guerre de la semaine passée, gagnée : le titre (la première fois) et la victoire au dossier
create or replace function public.reclamer_guerre() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  le_clan uuid;
  e jsonb;
  la_semaine text := prive.semaine_precedente();
begin
  perform 1 from public.profils where id = moi for update;
  select clan into le_clan from prive.membres_clan where joueur = moi;
  if le_clan is null then
    raise exception 'Il faut appartenir à un clan';
  end if;
  e := prive.etat_guerre(le_clan, moi, la_semaine);
  if e is null or e -> 'eux' = 'null'::jsonb or (e ->> 'nous')::int <= (e ->> 'eux')::int then
    raise exception 'Votre clan n’a pas remporté la guerre de la semaine passée';
  end if;
  if (e ->> 'moi')::int < 1 then
    raise exception 'Il faut y avoir marqué au moins un point';
  end if;
  insert into prive.guerres_reclamees (joueur, semaine) values (moi, la_semaine) on conflict do nothing;
  if not found then
    raise exception 'Victoire déjà inscrite à votre dossier';
  end if;
  insert into prive.cosmetiques_possedes (joueur, cosmetique) values (moi, 'titre-guerre') on conflict do nothing;
  update public.profils set stats = jsonb_set(coalesce(stats, '{}'), '{guerres}', to_jsonb(coalesce((stats ->> 'guerres')::int, 0) + 1))
   where id = moi;
  return jsonb_build_object('profil', prive.profil_json(moi), 'guerre', public.guerre_clan());
end $$;

revoke execute on function public.guerre_clan(), public.reclamer_guerre() from public, anon;
grant execute on function public.guerre_clan(), public.reclamer_guerre() to authenticated;
