-- SCP Masters : tableau de bord de l'économie, Épreuve de la semaine, raid de clan.
--  1. Tableau de bord (SQL Editor seulement) : `select * from prive.economie();` pour les crédits créés et détruits
--     jour par jour, `select * from prive.economie_motifs();` par motif, `select prive.economie_resume();`.
--  2. L'Épreuve de la semaine : dix questions, les mêmes pour tous (tirées par la fonction Edge « duel » à partir
--     de la semaine), une seule tentative. Classement par score ; récompenses le lundi (pg_cron).
--  3. Le raid de clan : chaque semaine, une anomalie Keter à reconfiner ensemble. Les duels et l'Épreuve des
--     membres l'entament ; si elle tombe avant lundi, chaque membre qui a contribué réclame sa récompense.
-- À exécuter dans le SQL Editor de Supabase, après 20261108090000_saisons_albums.sql.

-- ---------------------------------------------------------------------------
-- 1. Tableau de bord de l'économie
-- ---------------------------------------------------------------------------
-- Motifs qui déplacent des crédits entre joueurs (ou les mettent en séquestre) sans en créer ni en détruire
create or replace function prive.motifs_transfert() returns text[]
language sql immutable as $$
  select array['mise', 'mise_rendue', 'vente', 'echange', 'echange_rendu', 'echange_reserve'];
$$;

-- Jour par jour (heure de Paris) : crédits créés, détruits, solde net (les transferts ne comptent que par leurs
-- taxes), joueurs actifs, nouveaux comptes, dossiers ouverts et Mythiques tirées
create or replace function prive.economie(p_jours int default 14)
returns table (jour date, crees bigint, detruits bigint, net bigint, actifs int, nouveaux int, dossiers int, keter int, o5 int, apollyon int, mythiques int)
language sql stable as $$
  with jours as (
    select generate_series((now() at time zone 'Europe/Paris')::date - (p_jours - 1), (now() at time zone 'Europe/Paris')::date, interval '1 day')::date as jour
  ), m as (
    select (le at time zone 'Europe/Paris')::date as jour, joueur, montant, motif = any (prive.motifs_transfert()) as transfert
      from public.mouvements_credits
     where le >= now() - make_interval(days => p_jours + 1)
  ), t as (
    select (le at time zone 'Europe/Paris')::date as jour, joueur, type_booster, cartes
      from prive.tirages
     where le >= now() - make_interval(days => p_jours + 1)
  )
  select j.jour,
         coalesce((select sum(montant) from m where m.jour = j.jour and montant > 0 and not transfert), 0)::bigint,
         coalesce((select -sum(montant) from m where m.jour = j.jour and montant < 0 and not transfert), 0)::bigint,
         coalesce((select sum(montant) from m where m.jour = j.jour), 0)::bigint,
         (select count(distinct x.joueur) from (select joueur from m where m.jour = j.jour union select joueur from t where t.jour = j.jour) x)::int,
         (select count(*) from public.profils p where (p.cree_le at time zone 'Europe/Paris')::date = j.jour)::int,
         (select count(*) from t where t.jour = j.jour)::int,
         (select count(*) from t where t.jour = j.jour and type_booster = 'keter')::int,
         (select count(*) from t where t.jour = j.jour and type_booster = 'o5')::int,
         (select count(*) from t where t.jour = j.jour and type_booster = 'apollyon')::int,
         (select count(*) from t, jsonb_array_elements(t.cartes) e join public.cartes c on c.id = e->>'id'
           where t.jour = j.jour and c.ra = 5)::int
    from jours j
   order by j.jour desc;
$$;

-- Par jour et par motif : d'où viennent et où partent les crédits
create or replace function prive.economie_motifs(p_jours int default 7)
returns table (jour date, motif text, total bigint, mouvements int, joueurs int)
language sql stable as $$
  select (le at time zone 'Europe/Paris')::date, motif, sum(montant)::bigint, count(*)::int, count(distinct joueur)::int
    from public.mouvements_credits
   where le >= ((now() at time zone 'Europe/Paris')::date - (p_jours - 1))::timestamp at time zone 'Europe/Paris'
   group by 1, 2
   order by 1 desc, abs(sum(montant)) desc;
$$;

-- Aujourd'hui : crédits en circulation, répartition, les plus riches
create or replace function prive.economie_resume() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'joueurs', (select count(*) from public.profils),
    'actifs_7j', (select count(distinct joueur) from public.mouvements_credits where le >= now() - interval '7 days'),
    'en_circulation', (select coalesce(sum(credits), 0) from public.profils),
    'mediane', (select percentile_cont(0.5) within group (order by credits) from public.profils),
    'p90', (select percentile_cont(0.9) within group (order by credits) from public.profils),
    'plus_riches', (select jsonb_agg(x) from (select pseudo, credits from public.profils order by credits desc limit 10) x),
    'net_7j', (select coalesce(sum(montant), 0) from public.mouvements_credits where le >= now() - interval '7 days'));
$$;

-- ---------------------------------------------------------------------------
-- 2. L'Épreuve de la semaine
-- ---------------------------------------------------------------------------
-- La semaine en cours, désignée par son lundi (heure de Paris)
create or replace function prive.semaine_courante() returns text
language sql stable as $$
  select to_char(prive.debut_de_la_semaine() at time zone 'Europe/Paris', 'YYYY-MM-DD');
$$;

create or replace function prive.semaine_precedente() returns text
language sql stable as $$
  select to_char((prive.debut_de_la_semaine() - interval '7 days') at time zone 'Europe/Paris', 'YYYY-MM-DD');
$$;

create table if not exists prive.epreuves (
  joueur uuid not null references public.profils on delete cascade,
  semaine text not null,
  -- Les dix questions (avec leurs bonnes réponses), la question en cours, les réponses : seul le serveur le lit
  etat jsonb not null,
  version int not null default 0,
  score int not null default 0,
  bonnes int not null default 0,
  termine boolean not null default false,
  debut timestamptz not null default now(),
  fin timestamptz,
  primary key (joueur, semaine)
);
alter table prive.epreuves enable row level security;
create index if not exists epreuves_classement on prive.epreuves (semaine, score desc) where termine;

create table if not exists public.epreuves_resultats (
  semaine text not null,
  joueur uuid not null references public.profils on delete cascade,
  score int not null,
  rang int not null,
  credits int not null,
  primary key (semaine, joueur)
);
alter table public.epreuves_resultats enable row level security;
drop policy if exists "ses résultats d'épreuve" on public.epreuves_resultats;
create policy "ses résultats d'épreuve" on public.epreuves_resultats for select to authenticated using (auth.uid() = joueur);
revoke all on public.epreuves_resultats from anon, authenticated;
grant select on public.epreuves_resultats to authenticated;

-- Pour la fonction Edge : la semaine, la langue du joueur et sa tentative (s'il en a une)
create or replace function public.epreuve_preparer(p_joueur uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.profils;
  e prive.epreuves;
begin
  select * into p from public.profils where id = p_joueur;
  if not found then
    raise exception 'Joueur inconnu';
  end if;
  select * into e from prive.epreuves where joueur = p_joueur and semaine = prive.semaine_courante();
  return jsonb_build_object('semaine', prive.semaine_courante(), 'langue', p.langue,
                            'etat', e.etat, 'version', coalesce(e.version, 0), 'termine', coalesce(e.termine, false));
end $$;

-- Écrit la tentative : version 0 pour la créer (une seule par semaine), sinon la version lue
create or replace function public.epreuve_ecrire(p_joueur uuid, p_semaine text, p_version int, p_etat jsonb, p_score int, p_bonnes int, p_termine boolean)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_version = 0 then
    if p_semaine <> prive.semaine_courante() then
      return false;
    end if;
    insert into prive.epreuves (joueur, semaine, etat, version, score, bonnes, termine, fin)
    values (p_joueur, p_semaine, p_etat, 1, p_score, p_bonnes, p_termine, case when p_termine then now() end)
    on conflict do nothing;
    return found;
  end if;
  update prive.epreuves
     set etat = p_etat, version = version + 1, score = p_score, bonnes = p_bonnes, termine = p_termine,
         fin = case when p_termine then now() end
   where joueur = p_joueur and semaine = p_semaine and version = p_version and not termine;
  return found;
end $$;

-- Le classement d'une semaine : score, puis le plus rapide
create or replace function prive.classement_epreuve(p_semaine text)
returns table (joueur uuid, pseudo text, score int, bonnes int, duree int, rang int)
language sql stable as $$
  select e.joueur, p.pseudo, e.score, e.bonnes, extract(epoch from e.fin - e.debut)::int,
         (rank() over (order by e.score desc, e.fin - e.debut))::int
    from prive.epreuves e join public.profils p on p.id = e.joueur
   where e.semaine = p_semaine and e.termine;
$$;

create or replace function prive.recompense_epreuve(p_rang int) returns int
language sql immutable as $$
  select case when p_rang = 1 then 1500 when p_rang <= 3 then 1000 when p_rang <= 10 then 500 else 100 end;
$$;

-- Clôt une semaine (par défaut, la précédente) : récompense chaque tentative terminée selon son rang
create or replace function prive.clore_epreuve(p_semaine text default null) returns int
language plpgsql volatile as $$
declare
  la_semaine text := coalesce(p_semaine, prive.semaine_precedente());
  r record;
  n int := 0;
begin
  if exists (select 1 from public.epreuves_resultats x where x.semaine = la_semaine) then
    return 0;
  end if;
  for r in select * from prive.classement_epreuve(la_semaine) loop
    insert into public.epreuves_resultats (semaine, joueur, score, rang, credits)
    values (la_semaine, r.joueur, r.score, r.rang, prive.recompense_epreuve(r.rang));
    perform prive.crediter(r.joueur, prive.recompense_epreuve(r.rang), 'epreuve', la_semaine);
    n := n + 1;
  end loop;
  return n;
end $$;

-- L'Épreuve vue par un joueur : sa tentative, le classement de la semaine, son dernier résultat
create or replace function public.epreuve() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'semaine', prive.semaine_courante(),
    'fin', prive.debut_de_la_semaine() + interval '7 days',
    'moi', (select jsonb_build_object('score', e.score, 'bonnes', e.bonnes, 'termine', e.termine,
                                      'rang', (select c.rang from prive.classement_epreuve(e.semaine) c where c.joueur = e.joueur))
              from prive.epreuves e where e.joueur = prive.joueur() and e.semaine = prive.semaine_courante()),
    'participants', (select count(*) from prive.epreuves e where e.semaine = prive.semaine_courante() and e.termine),
    'classement', coalesce((select jsonb_agg(jsonb_build_object('pseudo', c.pseudo, 'score', c.score, 'bonnes', c.bonnes, 'duree', c.duree, 'rang', c.rang)
                                             order by c.rang)
                              from (select * from prive.classement_epreuve(prive.semaine_courante()) order by rang limit 20) c), '[]'::jsonb),
    'dernier', (select to_jsonb(r) - 'joueur' from public.epreuves_resultats r where r.joueur = prive.joueur() order by r.semaine desc limit 1));
$$;

-- ---------------------------------------------------------------------------
-- 3. Le raid de clan
-- ---------------------------------------------------------------------------
create table if not exists prive.raids_reclames (
  joueur uuid not null references public.profils on delete cascade,
  semaine text not null,
  le timestamptz not null default now(),
  primary key (joueur, semaine)
);
alter table prive.raids_reclames enable row level security;

-- L'anomalie de la semaine : la même pour tous les clans, tour à tour
create or replace function prive.cible_raid(p_semaine text) returns text
language sql immutable as $$
  select (array['scp-682', 'scp-096', 'scp-106', 'scp-3000', 'scp-610', 'scp-939', 'scp-2317', 'scp-049'])
         [1 + ((p_semaine::date - date '2026-01-05') / 7) % 8];
$$;

-- Ce que les membres d'un clan ont infligé pendant une semaine, chacun depuis son arrivée au clan.
-- Contre l'IA : 3 par bonne réponse, +15 la victoire ; entre agents : 20, +20 la victoire ; l'Épreuve : score / 15.
-- Au plus 150 par membre et par jour : un clan se bat à plusieurs.
create or replace function prive.degats_raid(p_clan uuid, p_semaine text)
returns table (joueur uuid, pseudo text, degats int)
language sql stable as $$
  with bornes as (
    select (p_semaine::date)::timestamp at time zone 'Europe/Paris' as debut,
           (p_semaine::date + 7)::timestamp at time zone 'Europe/Paris' as fin
  ), membres as (
    select m.joueur, greatest(m.rejoint_le, b.debut) as depuis, b.fin
      from prive.membres_clan m, bornes b
     where m.clan = p_clan
  ), coups as (
    select d.joueur, d.fin as le, d.bonnes * 3 + case when d.issue = 'victoire' then 15 else 0 end as degats
      from prive.duels_ia d join membres m on m.joueur = d.joueur
     where d.fin >= m.depuis and d.fin < m.fin and d.issue is not null
    union all
    select m.joueur, j.maj_le, 20 + case when j.gagnant = m.joueur then 20 else 0 end
      from public.duels_jcj j join membres m on m.joueur in (j.joueur_a, j.joueur_b)
     where j.statut = 'termine' and j.maj_le >= m.depuis and j.maj_le < m.fin
    union all
    select e.joueur, e.fin, e.score / 15
      from prive.epreuves e join membres m on m.joueur = e.joueur
     where e.termine and e.fin >= m.depuis and e.fin < m.fin
  ), par_jour as (
    select c.joueur, least(150, sum(c.degats)) as degats
      from coups c
     group by c.joueur, (c.le at time zone 'Europe/Paris')::date
  )
  select m.joueur, p.pseudo, coalesce((select sum(j.degats) from par_jour j where j.joueur = m.joueur), 0)::int
    from membres m join public.profils p on p.id = m.joueur;
$$;

create or replace function prive.pv_raid(p_clan uuid) returns int
language sql stable as $$
  select 250 + 100 * (select count(*)::int from prive.membres_clan where clan = p_clan);
$$;

-- Contribution minimale pour réclamer la récompense ; la récompense elle-même
create or replace function prive.requis_raid() returns int language sql immutable as $$ select 40 $$;
create or replace function prive.credits_raid() returns int language sql immutable as $$ select 500 $$;

create or replace function prive.etat_raid(p_clan uuid, p_joueur uuid, p_semaine text) returns jsonb
language sql stable as $$
  with d as (select * from prive.degats_raid(p_clan, p_semaine))
  select jsonb_build_object(
    'semaine', p_semaine,
    'cible', prive.cible_raid(p_semaine),
    'pv', prive.pv_raid(p_clan),
    'degats', (select coalesce(sum(degats), 0) from d),
    'vaincue', (select coalesce(sum(degats), 0) from d) >= prive.pv_raid(p_clan),
    'moi', coalesce((select degats from d where joueur = p_joueur), 0),
    'reclame', exists (select 1 from prive.raids_reclames r where r.joueur = p_joueur and r.semaine = p_semaine),
    'contributeurs', coalesce((select jsonb_agg(jsonb_build_object('pseudo', pseudo, 'degats', degats) order by degats desc)
                                 from d where degats > 0), '[]'::jsonb));
$$;

-- Le raid vu par un membre : la semaine en cours et la précédente (encore réclamable)
create or replace function public.raid() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when m.clan is null then null else jsonb_build_object(
    'fin', prive.debut_de_la_semaine() + interval '7 days',
    'requis', prive.requis_raid(),
    'credits', prive.credits_raid(),
    'courant', prive.etat_raid(m.clan, prive.joueur(), prive.semaine_courante()),
    'precedent', prive.etat_raid(m.clan, prive.joueur(), prive.semaine_precedente())) end
  from (select (select clan from prive.membres_clan where joueur = prive.joueur()) as clan) m;
$$;

create or replace function public.reclamer_raid(p_semaine text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  le_clan uuid;
  e jsonb;
begin
  perform 1 from public.profils where id = moi for update;
  select clan into le_clan from prive.membres_clan where joueur = moi;
  if le_clan is null then
    raise exception 'Il faut appartenir à un clan';
  end if;
  if p_semaine not in (prive.semaine_courante(), prive.semaine_precedente()) then
    raise exception 'Ce raid est clos';
  end if;
  e := prive.etat_raid(le_clan, moi, p_semaine);
  if not (e->>'vaincue')::boolean then
    raise exception 'L’anomalie n’est pas encore reconfinée';
  end if;
  if (e->>'moi')::int < prive.requis_raid() then
    raise exception 'Contribution insuffisante : % sur %', e->>'moi', prive.requis_raid();
  end if;
  insert into prive.raids_reclames (joueur, semaine) values (moi, p_semaine) on conflict do nothing;
  if not found then
    raise exception 'Récompense déjà réclamée';
  end if;
  perform prive.crediter(moi, prive.credits_raid(), 'raid', p_semaine);
  update public.profils set boosters = boosters + 1 where id = moi;
  return jsonb_build_object('profil', prive.profil_json(moi), 'raid', public.raid());
end $$;

-- ---------------------------------------------------------------------------
-- Droits et tâches planifiées
-- ---------------------------------------------------------------------------
revoke execute on function public.epreuve_preparer(uuid), public.epreuve_ecrire(uuid, text, int, jsonb, int, int, boolean) from public, anon, authenticated;
grant execute on function public.epreuve_preparer(uuid), public.epreuve_ecrire(uuid, text, int, jsonb, int, int, boolean) to service_role;
revoke execute on function public.epreuve(), public.raid(), public.reclamer_raid(text) from public, anon;
grant execute on function public.epreuve(), public.raid(), public.reclamer_raid(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Lundi 0 h 20 (UTC) : la semaine précédente est close à Paris
    perform cron.schedule('scp-masters-epreuve', '20 0 * * 1', 'select prive.clore_epreuve()');
  end if;
end $$;
