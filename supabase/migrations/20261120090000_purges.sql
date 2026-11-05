-- SCP Masters : la base ne grossit plus sans fin (plan gratuit : 500 Mo).
--  1. Le journal de pg_cron (cron.job_run_details) : quatre tâches par minute, jamais vidé (~50 Mo par mois).
--     On garde deux jours.
--  2. L'historique des tirages (prive.tirages) : missions de la semaine, rapport de clan (7 jours), rapport économique
--     (14 jours par défaut). On garde 90 jours ; les succès et les compteurs du profil n'en dépendent pas.
--  3. Les duels contre l'IA (prive.duels_ia) : l'état de partie (main, question) ne sert que pendant le duel ; il est
--     effacé un jour après la fin. Le duel lui-même (issue, bonnes réponses, gains) est gardé 90 jours (missions,
--     raids de la semaine, limite quotidienne).
-- Les duels entre agents ne sont pas touchés (leur écran de fin relit l'état).
-- Une fois par jour à 4 h 10 (heure UTC), et une fois tout de suite.
-- À exécuter dans le SQL Editor de Supabase, après 20261119090000_securite_audit.sql.

create or replace function prive.purger() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  journal bigint := 0;
  tirages bigint;
  etats bigint;
  duels bigint;
begin
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''2 days''';
    get diagnostics journal = row_count;
  end if;
  delete from prive.tirages where le < now() - interval '90 days';
  get diagnostics tirages = row_count;
  update prive.duels_ia set etat = null where fin is not null and fin < now() - interval '1 day' and etat is not null;
  get diagnostics etats = row_count;
  delete from prive.duels_ia where fin is not null and fin < now() - interval '90 days';
  get diagnostics duels = row_count;
  return jsonb_build_object('journal_cron', journal, 'tirages', tirages, 'etats_duels', etats, 'duels', duels);
end $$;

revoke all on function prive.purger() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('scp-masters-purge', '10 4 * * *', 'select prive.purger()');
  end if;
exception when others then
  raise notice 'Purge quotidienne non planifiée : %', sqlerrm;
end $$;

-- Tout de suite : ce que la purge a retiré
select prive.purger() as retire;
