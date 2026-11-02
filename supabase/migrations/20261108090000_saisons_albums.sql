-- SCP Masters : saisons classées et album.
--  1. Une saison classée dure un mois (heure de Paris). À sa clôture (le 1er, par pg_cron), chaque agent qui a joué
--     au moins 5 duels classés dans le mois reçoit une récompense selon son Elo : Or (1 300 et plus), Argent
--     (1 150), Bronze (1 050), sinon participation. Puis tous les Elo se rapprochent de moitié de 1 000.
--  2. L'album : des pages thématiques (Conseil O5, Protocoles IRA, codes, scénarios K, grandes entités,
--     départements, Sites, équipes FIM, Mythiques). Une page complète se réclame une fois, contre des crédits.
-- À exécuter dans le SQL Editor de Supabase, après 20261107090000_missions.sql.

-- ---------------------------------------------------------------------------
-- 1. Saisons classées
-- ---------------------------------------------------------------------------
create table if not exists public.saisons_resultats (
  saison text not null,
  joueur uuid not null references public.profils on delete cascade,
  elo int not null,
  rang int not null,
  palier text not null check (palier in ('or', 'argent', 'bronze', 'participation')),
  credits int not null,
  primary key (saison, joueur)
);
alter table public.saisons_resultats enable row level security;
drop policy if exists "ses résultats de saison" on public.saisons_resultats;
create policy "ses résultats de saison" on public.saisons_resultats for select to authenticated using (auth.uid() = joueur);
revoke all on public.saisons_resultats from anon, authenticated;
grant select on public.saisons_resultats to authenticated;

-- Le palier d'un Elo
create or replace function prive.palier(p_elo int) returns text
language sql immutable as $$
  select case when p_elo >= 1300 then 'or' when p_elo >= 1150 then 'argent' when p_elo >= 1050 then 'bronze' else 'participation' end;
$$;

-- Les bornes d'une saison « AAAA-MM » (heure de Paris)
create or replace function prive.debut_saison(p_saison text) returns timestamptz
language sql immutable as $$
  select (p_saison || '-01')::timestamp at time zone 'Europe/Paris';
$$;

create or replace function prive.saison_courante() returns text
language sql stable as $$
  select to_char(now() at time zone 'Europe/Paris', 'YYYY-MM');
$$;

-- Duels classés terminés d'un joueur pendant une saison
create or replace function prive.duels_de_saison(p_joueur uuid, p_saison text) returns int
language sql stable as $$
  select count(*)::int from public.duels_jcj
   where classe and statut = 'termine' and p_joueur in (joueur_a, joueur_b)
     and maj_le >= prive.debut_saison(p_saison) and maj_le < prive.debut_saison(p_saison) + interval '1 month';
$$;

-- Clôt une saison (par défaut, celle du mois qui vient de finir) : récompenses, puis Elo rapprochés de 1 000.
-- Sans effet si elle est déjà close.
create or replace function prive.clore_saison(p_saison text default null) returns int
language plpgsql volatile as $$
declare
  la_saison text := coalesce(p_saison, to_char((now() at time zone 'Europe/Paris') - interval '1 day', 'YYYY-MM'));
  r record;
  n int := 0;
begin
  if exists (select 1 from public.saisons_resultats where saisons_resultats.saison = la_saison) then
    return 0;
  end if;
  for r in
    select p.id, p.elo, rank() over (order by p.elo desc) as rang
      from public.profils p
     where prive.duels_de_saison(p.id, la_saison) >= 5
  loop
    insert into public.saisons_resultats (saison, joueur, elo, rang, palier, credits)
    values (la_saison, r.id, r.elo, r.rang, prive.palier(r.elo),
            case prive.palier(r.elo) when 'or' then 2500 when 'argent' then 1200 when 'bronze' then 600 else 200 end);
    perform prive.crediter(r.id, case prive.palier(r.elo) when 'or' then 2500 when 'argent' then 1200 when 'bronze' then 600 else 200 end,
                           'saison', la_saison);
    n := n + 1;
  end loop;
  update public.profils set elo = 1000 + round((elo - 1000) * 0.5)::int where elo <> 1000;
  return n;
end $$;

-- La saison vue par un joueur : en cours (fin, duels joués, palier actuel) et son dernier résultat
create or replace function public.saison() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'saison', prive.saison_courante(),
    'fin', prive.debut_saison(prive.saison_courante()) + interval '1 month',
    'duels', prive.duels_de_saison(prive.joueur(), prive.saison_courante()),
    'requis', 5,
    'palier', prive.palier((select elo from public.profils where id = prive.joueur())),
    'dernier', (select to_jsonb(r) - 'joueur' from public.saisons_resultats r where r.joueur = prive.joueur() order by r.saison desc limit 1));
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('scp-masters-saison', '15 0 1 * *', 'select prive.clore_saison()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. L'album
-- ---------------------------------------------------------------------------
create table if not exists prive.albums_reclames (
  joueur uuid not null references public.profils on delete cascade,
  album text not null,
  le timestamptz not null default now(),
  primary key (joueur, album)
);
alter table prive.albums_reclames enable row level security;

-- Les pages : [id, titre, motif de l'identifiant (expression régulière) ou rareté, crédits]
create or replace function prive.pages_album()
returns table (id text, titre text, motif text, rarete int, credits int)
language sql immutable as $$
  values
    ('conseil-o5', 'Le Conseil O5', '^perso:o5-', null::int, 3000),
    ('ira', 'Initiatives de Réponse Automatisée', '^proto:ira-', null, 800),
    ('codes', 'Codes de confinement', '^proto:code-', null, 600),
    ('scenarios-k', 'Scénarios de classe K', '^proto:[a-z]k$', null, 800),
    ('entites', 'Les grandes entités', '^entite:', null, 2000),
    ('departements', 'Les départements', '^dept:', null, 1000),
    ('sites', 'Les Sites de la Fondation', '^site:', null, 3000),
    ('fim', 'Les Forces d’intervention mobiles', '^fim:', null, 3000),
    ('mythiques', 'Les Mythiques', null, 5, 10000)
$$;

create or replace function prive.cartes_page(p_motif text, p_rarete int) returns setof text
language sql stable as $$
  select c.id from public.cartes c
   where (p_motif is null or c.id ~ p_motif) and (p_rarete is null or c.ra = p_rarete);
$$;

create or replace function public.albums() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'titre', a.titre, 'credits', a.credits,
      'total', (select count(*) from prive.cartes_page(a.motif, a.rarete)),
      'possedees', (select count(distinct x.carte_id) from public.exemplaires x
                     where x.proprietaire = prive.joueur() and x.carte_id in (select prive.cartes_page(a.motif, a.rarete))),
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
  if not exists (select 1 from prive.cartes_page(a.motif, a.rarete)) then
    raise exception 'Page d’album vide';
  end if;
  select count(*) into manquantes from prive.cartes_page(a.motif, a.rarete) c
   where not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = c);
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

revoke execute on function public.saison(), public.albums(), public.reclamer_album(text) from public, anon;
grant execute on function public.saison(), public.albums(), public.reclamer_album(text) to authenticated;
