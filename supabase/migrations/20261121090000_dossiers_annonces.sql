-- SCP Masters : prévenir l'agent quand sa réserve de dossiers gratuits atteint 5, puis 10 (pleine : la production
-- s'arrête tant qu'il n'en ouvre pas). Notification de la cloche, et sur l'appareil si le jeu n'est pas à l'écran.
-- Les dossiers gratuits ne sont crédités qu'à la visite suivante (prive.crediter_boosters) : la réserve « virtuelle »
-- est recalculée ici, sans rien créditer. Une annonce par palier : elle se réarme quand la réserve redescend.
-- Pas de tâche planifiée en plus (mémoire de l'instance) : la tâche des échéances, qui tourne chaque minute, s'en charge.
-- À exécuter dans le SQL Editor de Supabase, après 20261120090000_purges.sql.

alter table public.profils add column if not exists dossiers_annonces smallint not null default 0;

create or replace function prive.annoncer_dossiers() returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  for r in
    with reserve as (
      select id, dossiers_annonces as avant,
             least(10, boosters + greatest(0, floor(extract(epoch from now() - dernier_booster) / 900))::int) as n
        from public.profils
       where pseudo is not null
    ), paliers as (
      select id, avant, n, case when n >= 10 then 10 when n >= 5 then 5 else 0 end as palier from reserve
    )
    update public.profils p set dossiers_annonces = x.palier
      from paliers x
     where p.id = x.id and x.palier <> x.avant
    returning p.id, x.avant, x.palier, x.n
  loop
    -- Seulement en montant (en redescendant, l'annonce se réarme sans rien dire), et pas si l'agent est en train de
    -- jouer : le compteur de l'onglet Boosters le lui montre déjà
    if r.palier > r.avant and not prive.au_premier_plan(r.id) then
      perform prive.notifier(r.id, 'dossiers_prets', jsonb_build_object('nombre', r.palier));
    end if;
  end loop;
end $$;

revoke all on function prive.annoncer_dossiers() from public;

-- Le premier passage ne doit pas prévenir tout le monde d'un coup : on part de l'état actuel, sans notification
update public.profils
   set dossiers_annonces = case
     when least(10, boosters + greatest(0, floor(extract(epoch from now() - dernier_booster) / 900))::int) >= 10 then 10
     when least(10, boosters + greatest(0, floor(extract(epoch from now() - dernier_booster) / 900))::int) >= 5 then 5
     else 0 end;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('scp-masters-echeances', '* * * * *', 'select prive.clore_echeances(); select prive.annoncer_dossiers();');
  end if;
exception when others then
  raise notice 'Annonce des dossiers non planifiée : %', sqlerrm;
end $$;
