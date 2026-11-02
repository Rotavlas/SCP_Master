-- SCP Masters : notifications de la cloche pour l'Épreuve, la saison classée et le raid de clan.
--  - epreuve_resultat : à la clôture du lundi, rang, score et crédits de chaque participant ;
--  - saison_resultat : à la clôture du mois, palier, rang et crédits ;
--  - raid_vaincu : quand l'anomalie de la semaine tombe, à chaque membre du clan (une seule fois par semaine).
-- À exécuter dans le SQL Editor de Supabase, après 20261109090000_epreuve_raid_economie.sql.

-- ---------------------------------------------------------------------------
-- Clôtures : les mêmes, plus une notification par joueur récompensé
-- ---------------------------------------------------------------------------
create or replace function prive.clore_epreuve(p_semaine text default null) returns int
language plpgsql volatile as $$
declare
  la_semaine text := coalesce(p_semaine, prive.semaine_precedente());
  r record;
  n int := 0;
  total int;
begin
  if exists (select 1 from public.epreuves_resultats x where x.semaine = la_semaine) then
    return 0;
  end if;
  select count(*) into total from prive.classement_epreuve(la_semaine);
  for r in select * from prive.classement_epreuve(la_semaine) loop
    insert into public.epreuves_resultats (semaine, joueur, score, rang, credits)
    values (la_semaine, r.joueur, r.score, r.rang, prive.recompense_epreuve(r.rang));
    perform prive.crediter(r.joueur, prive.recompense_epreuve(r.rang), 'epreuve', la_semaine);
    perform prive.notifier(r.joueur, 'epreuve_resultat', jsonb_build_object(
      'semaine', la_semaine, 'rang', r.rang, 'participants', total, 'score', r.score, 'credits', prive.recompense_epreuve(r.rang)));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function prive.clore_saison(p_saison text default null) returns int
language plpgsql volatile as $$
declare
  la_saison text := coalesce(p_saison, to_char((now() at time zone 'Europe/Paris') - interval '1 day', 'YYYY-MM'));
  r record;
  n int := 0;
  gain int;
begin
  if exists (select 1 from public.saisons_resultats where saisons_resultats.saison = la_saison) then
    return 0;
  end if;
  for r in
    select p.id, p.elo, rank() over (order by p.elo desc) as rang
      from public.profils p
     where prive.duels_de_saison(p.id, la_saison) >= 5
  loop
    gain := case prive.palier(r.elo) when 'or' then 2500 when 'argent' then 1200 when 'bronze' then 600 else 200 end;
    insert into public.saisons_resultats (saison, joueur, elo, rang, palier, credits)
    values (la_saison, r.id, r.elo, r.rang, prive.palier(r.elo), gain);
    perform prive.crediter(r.id, gain, 'saison', la_saison);
    perform prive.notifier(r.id, 'saison_resultat', jsonb_build_object(
      'saison', la_saison, 'palier', prive.palier(r.elo), 'rang', r.rang, 'elo', r.elo, 'credits', gain));
    n := n + 1;
  end loop;
  update public.profils set elo = 1000 + round((elo - 1000) * 0.5)::int where elo <> 1000;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Raid : annoncé au clan dès que l'anomalie tombe
-- ---------------------------------------------------------------------------
create table if not exists prive.raids_annonces (
  clan uuid not null references prive.clans on delete cascade,
  semaine text not null,
  le timestamptz not null default now(),
  primary key (clan, semaine)
);
alter table prive.raids_annonces enable row level security;

-- Après un duel ou une Épreuve d'un joueur : son clan vient-il de reconfiner l'anomalie de la semaine ?
create or replace function prive.verifier_raid(p_joueur uuid) returns void
language plpgsql volatile as $$
declare
  le_clan uuid;
  la_semaine text := prive.semaine_courante();
  membre uuid;
begin
  select clan into le_clan from prive.membres_clan where joueur = p_joueur;
  if le_clan is null or exists (select 1 from prive.raids_annonces where clan = le_clan and semaine = la_semaine) then
    return;
  end if;
  if (select coalesce(sum(degats), 0) from prive.degats_raid(le_clan, la_semaine)) < prive.pv_raid(le_clan) then
    return;
  end if;
  insert into prive.raids_annonces (clan, semaine) values (le_clan, la_semaine) on conflict do nothing;
  if not found then
    return;
  end if;
  for membre in select joueur from prive.membres_clan where clan = le_clan loop
    perform prive.notifier(membre, 'raid_vaincu', jsonb_build_object('semaine', la_semaine, 'carte', prive.cible_raid(la_semaine)));
  end loop;
end $$;

-- Les déclencheurs : un contrôle raté ne doit jamais empêcher un duel ou une Épreuve de se terminer
create or replace function prive.raid_apres_partie() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    if tg_table_name = 'duels_jcj' then
      perform prive.verifier_raid(new.joueur_a);
      perform prive.verifier_raid(new.joueur_b);
    else
      perform prive.verifier_raid(new.joueur);
    end if;
  exception when others then
    raise warning 'raid : %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists raid_duels_ia on prive.duels_ia;
create trigger raid_duels_ia after update of fin on prive.duels_ia
  for each row when (old.fin is null and new.fin is not null and new.issue is not null)
  execute function prive.raid_apres_partie();

drop trigger if exists raid_duels_jcj on public.duels_jcj;
create trigger raid_duels_jcj after update of statut on public.duels_jcj
  for each row when (old.statut <> 'termine' and new.statut = 'termine')
  execute function prive.raid_apres_partie();

drop trigger if exists raid_epreuves on prive.epreuves;
create trigger raid_epreuves after insert or update of termine on prive.epreuves
  for each row when (new.termine)
  execute function prive.raid_apres_partie();
