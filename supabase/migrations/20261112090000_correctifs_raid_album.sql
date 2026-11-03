-- SCP Masters : correctifs du raid de clan, album plus léger.
--  1. Raid : une anomalie reconfinée le reste, même si un membre quitte ensuite le clan (jusqu'ici, ses dégâts
--     partaient avec lui et la récompense redevenait inaccessible aux autres). Et seuls comptent les coups portés
--     jusqu'à sa chute : rejoindre un clan déjà victorieux ne permet plus de réclamer sans avoir contribué.
--  2. Album : les fiches de chaque page sont rangées une fois pour toutes (prive.album_cartes, tenue à jour quand le
--     catalogue change) au lieu de repasser les 17 500 fiches à chaque lecture de l'accueil.
-- À exécuter dans le SQL Editor de Supabase, après 20261111090000_rarete_rapport_piste_fil.sql.

-- ---------------------------------------------------------------------------
-- 1. Raid
-- ---------------------------------------------------------------------------
create or replace function prive.degats_raid(p_clan uuid, p_semaine text)
returns table (joueur uuid, pseudo text, degats int)
language sql stable as $$
  with bornes as (
    select (p_semaine::date)::timestamp at time zone 'Europe/Paris' as debut,
           (p_semaine::date + 7)::timestamp at time zone 'Europe/Paris' as fin,
           -- L'instant où l'anomalie est tombée : rien ne compte après (le coup fatal, du même instant, compte)
           coalesce((select a.le from prive.raids_annonces a where a.clan = p_clan and a.semaine = p_semaine), 'infinity'::timestamptz) as chute
  ), membres as (
    select m.joueur, greatest(m.rejoint_le, b.debut) as depuis, b.fin, b.chute
      from prive.membres_clan m, bornes b
     where m.clan = p_clan
  ), coups as (
    select d.joueur, d.fin as le, d.bonnes * 3 + case when d.issue = 'victoire' then 15 else 0 end as degats
      from prive.duels_ia d join membres m on m.joueur = d.joueur
     where d.fin >= m.depuis and d.fin < m.fin and d.fin <= m.chute and d.issue is not null
    union all
    select m.joueur, j.maj_le, 20 + case when j.gagnant = m.joueur then 20 else 0 end
      from public.duels_jcj j join membres m on m.joueur in (j.joueur_a, j.joueur_b)
     where j.statut = 'termine' and j.maj_le >= m.depuis and j.maj_le < m.fin and j.maj_le <= m.chute
    union all
    select e.joueur, e.fin, e.score / 15
      from prive.epreuves e join membres m on m.joueur = e.joueur
     where e.termine and e.fin >= m.depuis and e.fin < m.fin and e.fin <= m.chute
  ), par_jour as (
    select c.joueur, least(150, sum(c.degats)) as degats
      from coups c
     group by c.joueur, (c.le at time zone 'Europe/Paris')::date
  )
  select m.joueur, p.pseudo, coalesce((select sum(j.degats) from par_jour j where j.joueur = m.joueur), 0)::int
    from membres m join public.profils p on p.id = m.joueur;
$$;

create or replace function prive.etat_raid(p_clan uuid, p_joueur uuid, p_semaine text) returns jsonb
language sql stable as $$
  with d as (select * from prive.degats_raid(p_clan, p_semaine)),
  v as (
    -- Reconfinée une fois, reconfinée pour de bon (annoncée au clan), quoi que deviennent ses membres
    select exists (select 1 from prive.raids_annonces a where a.clan = p_clan and a.semaine = p_semaine)
           or (select coalesce(sum(degats), 0) from d) >= prive.pv_raid(p_clan) as vaincue
  )
  select jsonb_build_object(
    'semaine', p_semaine,
    'cible', prive.cible_raid(p_semaine),
    'pv', prive.pv_raid(p_clan),
    'degats', (select coalesce(sum(degats), 0) from d),
    'vaincue', (select vaincue from v),
    'moi', coalesce((select degats from d where joueur = p_joueur), 0),
    'reclame', exists (select 1 from prive.raids_reclames r where r.joueur = p_joueur and r.semaine = p_semaine),
    'contributeurs', coalesce((select jsonb_agg(jsonb_build_object('pseudo', pseudo, 'degats', degats) order by degats desc)
                                 from d where degats > 0), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 2. Album : les fiches de chaque page, rangées d'avance
-- ---------------------------------------------------------------------------
create table if not exists prive.album_cartes (
  album text not null,
  carte text not null,
  primary key (album, carte)
);
alter table prive.album_cartes enable row level security;

create or replace function prive.remplir_albums() returns void
language sql volatile as $$
  delete from prive.album_cartes;
  insert into prive.album_cartes (album, carte)
  select a.id, c from prive.pages_album() a, prive.cartes_page(a.motif, a.rarete) c;
$$;

-- Le catalogue change (nouvelles fiches, raretés revues) : les pages se recomposent
create or replace function prive.albums_apres_catalogue() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform prive.remplir_albums();
  return null;
end $$;

drop trigger if exists albums_catalogue on public.cartes;
create trigger albums_catalogue after insert or update or delete on public.cartes
  for each statement execute function prive.albums_apres_catalogue();

select prive.remplir_albums();

create or replace function public.albums() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with mes_cartes as (
    select distinct carte_id from public.exemplaires where proprietaire = prive.joueur()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'titre', a.titre, 'credits', a.credits,
      'total', (select count(*) from prive.album_cartes ac where ac.album = a.id),
      'possedees', (select count(*) from prive.album_cartes ac join mes_cartes m on m.carte_id = ac.carte where ac.album = a.id),
      'reclame', exists (select 1 from prive.albums_reclames r where r.joueur = prive.joueur() and r.album = a.id))
    order by a.credits), '[]'::jsonb)
  from prive.pages_album() a;
$$;

create or replace function public.reclamer_album(p_album text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  a record;
  manquantes int;
begin
  perform 1 from public.profils where id = moi for update;
  select * into a from prive.pages_album() x where x.id = p_album;
  if not found then
    raise exception 'Page d’album inconnue';
  end if;
  if not exists (select 1 from prive.album_cartes where album = a.id) then
    raise exception 'Page d’album vide';
  end if;
  select count(*) into manquantes from prive.album_cartes ac
   where ac.album = a.id and not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = ac.carte);
  if manquantes > 0 then
    raise exception 'Page incomplète : il manque % fiche(s)', manquantes;
  end if;
  insert into prive.albums_reclames (joueur, album) values (moi, a.id) on conflict do nothing;
  if not found then
    raise exception 'Récompense déjà réclamée';
  end if;
  perform prive.crediter(moi, a.credits, 'album', a.id);
  return jsonb_build_object('profil', prive.profil_json(moi), 'albums', public.albums());
end $$;
