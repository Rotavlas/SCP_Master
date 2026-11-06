-- SCP Masters : réglages des notifications, titre Thaumiel, console du créateur.
--  1. Chaque agent coupe les notifications qu'il ne veut pas, type par type : elles ne partent plus sur l'appareil
--     (la cloche les garde), sauf la réserve de dossiers, qui disparaît tout à fait quand on la coupe.
--  2. Niveau 5 d'accréditation (5 000 XP) : le titre « Thaumiel », seul ajout du dernier niveau (cosmétique).
--  3. La console du créateur : les messages signalés (supprimer ou classer), l'économie, l'activité des joueurs.
-- À exécuter dans le SQL Editor de Supabase, après 20261123090000_guerre_clans.sql.

-- ---------------------------------------------------------------------------
-- 1. Notifications coupées, type par type
-- ---------------------------------------------------------------------------
alter table public.profils add column if not exists notifications_coupees text[] not null default '{}';

create or replace function prive.types_notifications() returns text[]
language sql immutable as $$
  select array['souhait_en_vente', 'surencheri', 'enchere_gagnee', 'vente_conclue', 'vente_invendue', 'echange_recu',
               'echange_accepte', 'echange_refuse', 'epreuve_resultat', 'saison_resultat', 'raid_vaincu', 'dossiers_prets', 'message'];
$$;

create or replace function public.mes_notifications_coupees() returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select notifications_coupees from public.profils where id = prive.joueur();
$$;

create or replace function public.couper_notifications(p_types text[]) returns text[]
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  propres text[];
begin
  select coalesce(array_agg(distinct t), '{}') into propres
    from unnest(coalesce(p_types, '{}')) t where t = any (prive.types_notifications());
  update public.profils set notifications_coupees = propres where id = prive.joueur();
  return propres;
end $$;

create or replace function prive.pousser_notification() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from prive.abonnements_push where joueur = new.joueur) and not prive.au_premier_plan(new.joueur)
     and not exists (select 1 from public.profils where id = new.joueur and new.type = any (notifications_coupees)) then
    insert into prive.push_file (joueur, type, donnees) values (new.joueur, new.type, new.donnees);
  end if;
  return null;
end $$;

create or replace function prive.pousser_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  dest uuid;
begin
  if new.salon not like 'mp:%' or new.auteur is null then
    return null;
  end if;
  dest := case when split_part(new.salon, ':', 2) = new.auteur::text then split_part(new.salon, ':', 3) else split_part(new.salon, ':', 2) end::uuid;
  if exists (select 1 from prive.abonnements_push where joueur = dest)
     and not prive.au_premier_plan(dest)
     and not exists (select 1 from public.profils where id = dest and 'message' = any (notifications_coupees))
     and not exists (select 1 from prive.push_file where joueur = dest and type = 'message' and donnees ->> 'de' = new.pseudo) then
    insert into prive.push_file (joueur, type, donnees)
      values (dest, 'message', jsonb_build_object('de', new.pseudo, 'texte', left(new.texte, 120)));
  end if;
  return null;
end $$;

-- La réserve de dossiers coupée ne s'annonce plus du tout (ni cloche, ni appareil)
create or replace function prive.annoncer_dossiers() returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r record;
begin
  for r in
    with reserve as (
      select id, dossiers_annonces as avant, 'dossiers_prets' = any (notifications_coupees) as coupee,
             least(10, boosters + greatest(0, floor(extract(epoch from now() - dernier_booster) / 900))::int) as n
        from public.profils
       where pseudo is not null
    ), paliers as (
      select id, avant, coupee, n, case when n >= 10 then 10 when n >= 5 then 5 else 0 end as palier from reserve
    )
    update public.profils p set dossiers_annonces = x.palier
      from paliers x
     where p.id = x.id and x.palier <> x.avant
    returning p.id, x.avant, x.palier, x.n, x.coupee
  loop
    if r.palier > r.avant and not r.coupee and not prive.au_premier_plan(r.id) then
      perform prive.notifier(r.id, 'dossiers_prets', jsonb_build_object('nombre', r.palier));
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Le titre Thaumiel, au niveau 5 d'accréditation
-- ---------------------------------------------------------------------------
insert into prive.cosmetiques (id, type, prix, ordre) values ('titre-thaumiel', 'titre', null, 211)
on conflict (id) do update set type = excluded.type, prix = excluded.prix, ordre = excluded.ordre;

create or replace function public.reclamer_titre_thaumiel() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if prive.accreditation((select xp from public.profils where id = moi)) < 5 then
    raise exception 'Réservé au niveau 5 d’accréditation (5 000 XP)';
  end if;
  insert into prive.cosmetiques_possedes (joueur, cosmetique) values (moi, 'titre-thaumiel') on conflict do nothing;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 3. La console du créateur
-- ---------------------------------------------------------------------------
-- Les messages signalés, regroupés par message (le plus signalé d'abord)
create or replace function public.signalements_admin() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  return coalesce((
    select jsonb_agg(x order by x.nombre desc, x.dernier desc)
      from (
        select s.message,
               count(*)::int as nombre,
               max(s.le) as dernier,
               (array_agg(s.texte order by s.le desc))[1] as texte,
               (select p.pseudo from public.profils p where p.id = (array_agg(s.auteur))[1]) as auteur,
               array_agg(distinct coalesce(nullif(s.raison, ''), '—')) as raisons,
               array_agg(distinct (select p.pseudo from public.profils p where p.id = s.signaleur)) as signaleurs,
               exists (select 1 from public.messages m where m.id = s.message) as visible,
               (select m.salon from public.messages m where m.id = s.message) as salon
          from prive.signalements s
         where s.message > 0
         group by s.message
         order by count(*) desc, max(s.le) desc
         limit 100
      ) x), '[]'::jsonb);
end $$;

-- Supprimer le message signalé (et classer ses signalements), ou classer les signalements sans suite
create or replace function public.moderer_signalement(p_message bigint, p_action text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  if p_action not in ('supprimer', 'classer') then
    raise exception 'Action inconnue';
  end if;
  if p_action = 'supprimer' then
    delete from public.messages where id = p_message;
  end if;
  delete from prive.signalements where message = p_message;
  return public.signalements_admin();
end $$;

-- L'économie des derniers jours (prive.economie) et l'activité des joueurs
create or replace function public.tableau_createur(p_jours int default 14) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  return jsonb_build_object(
    'joueurs', jsonb_build_object(
      'agents', (select count(*) from public.profils where pseudo is not null),
      'actifs_jour', (select count(*) from public.profils where vu_le > now() - interval '1 day'),
      'actifs_semaine', (select count(*) from public.profils where vu_le > now() - interval '7 days'),
      'actifs_mois', (select count(*) from public.profils where vu_le > now() - interval '30 days'),
      'en_ligne', (select count(*) from public.profils where vu_le > now() - interval '3 minutes'),
      'nouveaux_semaine', (select count(*) from public.profils where cree_le > now() - interval '7 days'),
      'appareils', (select count(distinct joueur) from prive.abonnements_push),
      'clans', (select count(*) from prive.clans)),
    'jour', jsonb_build_object(
      'duels_ia', (select count(*) from prive.duels_ia where debut > now() - interval '1 day'),
      'duels_jcj', (select count(*) from public.duels_jcj where cree_le > now() - interval '1 day'),
      'dossiers', (select count(*) from prive.tirages where le > now() - interval '1 day'),
      'messages', (select count(*) from public.messages where cree_le > now() - interval '1 day'),
      'signalements', (select count(*) from prive.signalements where le > now() - interval '1 day')),
    'base', pg_size_pretty(pg_database_size(current_database())),
    'economie', coalesce((select jsonb_agg(to_jsonb(e) order by e.jour desc) from prive.economie(least(greatest(p_jours, 1), 60)) e), '[]'::jsonb));
end $$;

revoke execute on function public.mes_notifications_coupees(), public.couper_notifications(text[]), public.reclamer_titre_thaumiel(),
  public.signalements_admin(), public.moderer_signalement(bigint, text), public.tableau_createur(int) from public, anon;
grant execute on function public.mes_notifications_coupees(), public.couper_notifications(text[]), public.reclamer_titre_thaumiel(),
  public.signalements_admin(), public.moderer_signalement(bigint, text), public.tableau_createur(int) to authenticated;
