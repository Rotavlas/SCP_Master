-- Diagnostic mémoire (indicateur « Memory commitment » du dashboard) : lecture seule, rien n'est modifié.
-- À coller dans le SQL Editor de Supabase. Une seule requête : le SQL Editor n'affiche que le dernier résultat.
-- Rubriques : réglages mémoire, connexions ouvertes (par service et état), requêtes les plus lourdes,
-- tâches planifiées, réplication (temps réel), taille de la base.
with reglages as (
  select 1 as ordre, 0::float8 as tri, 'réglage' as rubrique, name as quoi,
         case when unit = '8kB' then pg_size_pretty(setting::bigint * 8192)
              when unit = 'kB' then pg_size_pretty(setting::bigint * 1024)
              else setting || coalesce(' ' || unit, '') end as valeur
    from pg_settings
   where name in ('shared_buffers', 'work_mem', 'maintenance_work_mem', 'max_connections', 'max_worker_processes',
                  'autovacuum_max_workers', 'cron.use_background_workers', 'cron.max_running_jobs')
), connexions as (
  select 2, count(*)::float8, 'connexions', coalesce(nullif(application_name, ''), backend_type) || ' / ' || coalesce(usename, '-') || ' / ' || coalesce(state, '-'),
         count(*)::text
    from pg_stat_activity
   group by 3, 4
), total_connexions as (
  select 3, 0, 'connexions', 'TOTAL', count(*)::text || ' sur ' || current_setting('max_connections') from pg_stat_activity
), requetes as (
  select 4, total_exec_time, 'requête lourde',
         left(regexp_replace(query, '\s+', ' ', 'g'), 110),
         calls || ' appels, ' || round(mean_exec_time::numeric, 1) || ' ms en moyenne, ' || round(total_exec_time::numeric / 1000) || ' s au total'
           || case when temp_blks_written > 0 then ', ' || pg_size_pretty(temp_blks_written * 8192) || ' écrits sur disque (work_mem dépassé)' else '' end
    from (select * from extensions.pg_stat_statements order by total_exec_time desc limit 12) s
), taches as (
  select 5, 0, 'tâche planifiée', jobname || ' (' || schedule || ')', case when active then 'active' else 'inactive' end from cron.job
), replication as (
  select 6, 0, 'réplication', slot_name || ' / ' || coalesce(plugin, '-') || ' / ' || case when active then 'active' else 'inactive' end,
         pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) || ' de journal retenu'
    from pg_replication_slots
), taille as (
  select 7, 0, 'taille', 'base de données', pg_size_pretty(pg_database_size(current_database()))
)
select rubrique, quoi, valeur from (
  select * from reglages union all select * from connexions union all select * from total_connexions
  union all select * from requetes union all select * from taches union all select * from replication union all select * from taille
) x
order by ordre, tri desc, quoi;
