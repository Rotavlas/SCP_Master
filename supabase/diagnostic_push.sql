-- Diagnostic des notifications sur l'appareil, à lancer dans le SQL Editor de Supabase (lecture seule).
-- Une ligne par point de contrôle : ce qu'il faut voir est dans la colonne « attendu ».
select 'appareils abonnés' as controle, count(*)::text as valeur, 'au moins 1 (votre téléphone)' as attendu
  from prive.abonnements_push
union all
select 'appareils Apple', count(*)::text, 'au moins 1 si un iPhone est abonné'
  from prive.abonnements_push where endpoint like 'https://web.push.apple.com/%'
union all
select 'en file d''attente', count(*)::text, '0 (la file se vide chaque minute)'
  from prive.push_file
union all
select 'extension pg_net', coalesce((select extversion from pg_extension where extname = 'pg_net'), 'ABSENTE'), 'une version'
union all
select 'tâche scp-masters-push', coalesce((select schedule || (case when active then ' (active)' else ' (INACTIVE)' end)
                                            from cron.job where jobname = 'scp-masters-push'), 'ABSENTE'), '* * * * * (active)'
union all
select 'dernière exécution de la tâche', coalesce((select d.status || ' · ' || to_char(d.start_time at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS')
                                                     || coalesce(' · ' || nullif(d.return_message, ''), '')
                                                     from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                                                    where j.jobname = 'scp-masters-push' order by d.start_time desc limit 1), 'aucune'),
       'succeeded, il y a moins d''une minute'
union all
select 'dernier appel de la fonction', coalesce((select coalesce(status_code::text, 'sans réponse') || ' · '
                                                   || to_char(created at time zone 'Europe/Paris', 'DD/MM HH24:MI:SS') || ' · '
                                                   || left(coalesce(content, error_msg, ''), 120)
                                                   from net._http_response order by created desc limit 1), 'aucun'),
       '200 · {"envoyes":…} (seulement après une notification)';
