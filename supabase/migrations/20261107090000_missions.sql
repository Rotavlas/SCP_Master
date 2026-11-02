-- SCP Masters : missions quotidiennes et hebdomadaires.
-- Chaque jour, trois missions tirées pour chaque joueur parmi six ; chaque semaine, trois missions plus longues.
-- La progression ne se déclare pas : elle se lit dans ce que le serveur enregistre déjà (dossiers ouverts,
-- confrontations, duels entre agents, recyclages, ventes). Une mission accomplie se réclame une fois par période :
-- des crédits et/ou des dossiers gratuits (stock).
-- À exécuter dans le SQL Editor de Supabase, après 20261106090000_economie.sql.

create table if not exists prive.missions_reclamees (
  joueur uuid not null references public.profils on delete cascade,
  -- « jour:2026-11-02 » ou « semaine:2026-11-02 » (le lundi)
  periode text not null,
  mission text not null,
  le timestamptz not null default now(),
  primary key (joueur, periode, mission)
);
alter table prive.missions_reclamees enable row level security;

-- Le catalogue : [id, période, ce qui compte, objectif, crédits, dossiers, titre]
create or replace function prive.catalogue_missions()
returns table (id text, periode text, source text, objectif int, credits int, dossiers int, titre text)
language sql immutable as $$
  values
    ('j-dossiers', 'jour', 'dossiers', 3, 60, 0, 'Ouvrir 3 dossiers'),
    ('j-victoires', 'jour', 'victoires_ia', 2, 80, 0, 'Gagner 2 confrontations contre l’IA'),
    ('j-bonnes', 'jour', 'bonnes', 8, 60, 0, 'Donner 8 bonnes réponses en confrontation'),
    ('j-agents', 'jour', 'duels_jcj', 1, 100, 0, 'Jouer un duel entre agents'),
    ('j-recycler', 'jour', 'recyclages', 5, 0, 1, 'Recycler ou brûler les doublons de 5 fiches'),
    ('j-vendre', 'jour', 'ventes', 1, 60, 0, 'Vendre une fiche au marché'),
    ('s-victoires', 'semaine', 'victoires_ia', 10, 500, 0, 'Gagner 10 confrontations contre l’IA'),
    ('s-agents', 'semaine', 'duels_jcj', 5, 600, 0, 'Jouer 5 duels entre agents'),
    ('s-dossiers', 'semaine', 'dossiers', 15, 0, 3, 'Ouvrir 15 dossiers')
$$;

-- Ce qui compte pour une mission, depuis le début de sa période
create or replace function prive.progres_mission(p_joueur uuid, p_source text, p_depuis timestamptz) returns int
language sql stable as $$
  select case p_source
    when 'dossiers' then (select count(*) from prive.tirages where joueur = p_joueur and le >= p_depuis)
    when 'victoires_ia' then (select count(*) from prive.duels_ia where joueur = p_joueur and fin >= p_depuis and issue = 'victoire')
    when 'bonnes' then (select coalesce(sum(bonnes), 0) from prive.duels_ia where joueur = p_joueur and fin >= p_depuis)
    when 'duels_jcj' then (select count(*) from public.duels_jcj
                            where p_joueur in (joueur_a, joueur_b) and statut = 'termine' and maj_le >= p_depuis)
    when 'recyclages' then (select count(*) from public.mouvements_credits
                             where joueur = p_joueur and motif in ('recyclage', 'brulage') and le >= p_depuis)
    when 'ventes' then (select count(*) from public.mouvements_credits where joueur = p_joueur and motif = 'vente' and le >= p_depuis)
    else 0
  end::int;
$$;

-- Les missions du moment d'un joueur : les trois du jour (tirées pour lui) et celles de la semaine
create or replace function prive.missions_du_moment(p_joueur uuid)
returns table (id text, periode text, source text, objectif int, credits int, dossiers int, titre text, cle text, depuis timestamptz, fin timestamptz)
language sql stable as $$
  with jour as (
    select c.*, 'jour:' || to_char(prive.debut_du_jour() at time zone 'Europe/Paris', 'YYYY-MM-DD') as cle,
           prive.debut_du_jour() as depuis, prive.debut_du_jour() + interval '1 day' as fin
      from prive.catalogue_missions() c
     where c.periode = 'jour'
     order by md5(p_joueur::text || to_char(prive.debut_du_jour(), 'YYYY-MM-DD') || c.id)
     limit 3
  ), semaine as (
    select c.*, 'semaine:' || to_char(prive.debut_de_la_semaine() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
           prive.debut_de_la_semaine(), prive.debut_de_la_semaine() + interval '7 days'
      from prive.catalogue_missions() c
     where c.periode = 'semaine'
  )
  select * from jour union all select * from semaine;
$$;

create or replace function public.missions() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'periode', m.periode, 'titre', m.titre, 'objectif', m.objectif,
      'progres', least(m.objectif, prive.progres_mission(prive.joueur(), m.source, m.depuis)),
      'credits', m.credits, 'dossiers', m.dossiers, 'fin', m.fin,
      'reclamee', exists (select 1 from prive.missions_reclamees r where r.joueur = prive.joueur() and r.periode = m.cle and r.mission = m.id))
    order by m.periode, m.id), '[]'::jsonb)
  from prive.missions_du_moment(prive.joueur()) m;
$$;

create or replace function public.reclamer_mission(p_mission text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  m record;
begin
  perform 1 from public.profils where id = moi for update;
  select * into m from prive.missions_du_moment(moi) x where x.id = p_mission;
  if not found then
    raise exception 'Cette mission n’est pas au programme du moment';
  end if;
  if prive.progres_mission(moi, m.source, m.depuis) < m.objectif then
    raise exception 'Mission pas encore accomplie';
  end if;
  insert into prive.missions_reclamees (joueur, periode, mission) values (moi, m.cle, m.id) on conflict do nothing;
  if not found then
    raise exception 'Récompense déjà réclamée';
  end if;
  if m.credits > 0 then
    perform prive.crediter(moi, m.credits, 'mission', m.id);
  end if;
  if m.dossiers > 0 then
    update public.profils set boosters = boosters + m.dossiers where id = moi;
  end if;
  return jsonb_build_object('profil', prive.profil_json(moi), 'missions', public.missions());
end $$;

revoke execute on function public.missions(), public.reclamer_mission(text) from public, anon;
grant execute on function public.missions(), public.reclamer_mission(text) to authenticated;
