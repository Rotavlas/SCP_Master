-- SCP Masters : l'historique de ses dossiers, et les annonces sur le Discord de la communauté.
--  1. public.mes_tirages() : les derniers dossiers ouverts par l'agent (90 jours gardés, prive.purger).
--  2. Les annonces Discord passent par un webhook (Paramètres du salon → Intégrations → Webhooks → Copier l'URL),
--     rangé dans prive.discord, jamais dans le code ni dans le dépôt. À faire une fois dans le SQL Editor :
--       insert into prive.discord (cle, url) values ('annonces', 'https://discord.com/api/webhooks/…')
--       on conflict (cle) do update set url = excluded.url;
--     ('annonces' sert à tout ; une ligne 'versions' ou 'podiums' envoie ces messages-là dans un autre salon.)
--  3. Les notes de version : publiées une fois (le premier chargement de la nouvelle version par le créateur).
--  4. Le podium de l'Épreuve (le lundi) et celui de la saison classée (le 1er du mois), après leur clôture.
-- À exécuter dans le SQL Editor de Supabase, après 20261124090000_reglages_console.sql.

-- ---------------------------------------------------------------------------
-- 1. Mes derniers dossiers
-- ---------------------------------------------------------------------------
create or replace function public.mes_tirages(p_limite int default 40) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', t.type_booster, 'cartes', t.cartes, 'le', t.le) order by t.le desc), '[]'::jsonb)
    from (select * from prive.tirages where joueur = prive.joueur() order by le desc limit least(greatest(p_limite, 1), 100)) t;
$$;

-- ---------------------------------------------------------------------------
-- 2. Le webhook Discord et l'envoi d'un message
-- ---------------------------------------------------------------------------
create table if not exists prive.discord (
  cle text primary key,
  url text not null check (url ~ '^https://(discord\.com|discordapp\.com)/api/webhooks/')
);
alter table prive.discord enable row level security;

create table if not exists prive.discord_publie (
  cle text primary key,
  le timestamptz not null default now()
);
alter table prive.discord_publie enable row level security;

-- Envoie un message (embeds Discord) sur le webhook de ce type, ou à défaut sur 'annonces' ; une seule fois par clé
create or replace function prive.publier_discord(p_type text, p_cle text, p_message jsonb) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  adresse text;
begin
  select url into adresse from prive.discord where cle = p_type;
  if adresse is null then
    select url into adresse from prive.discord where cle = 'annonces';
  end if;
  if adresse is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return false;
  end if;
  insert into prive.discord_publie (cle) values (p_cle) on conflict do nothing;
  if not found then
    return false;
  end if;
  perform net.http_post(
    url := adresse,
    -- Aucune mention (@everyone, @rôle) ne peut partir, quel que soit le texte
    body := jsonb_build_object('username', 'SCP Masters', 'allowed_mentions', jsonb_build_object('parse', '[]'::jsonb)) || p_message,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Les notes de version (le créateur les envoie en chargeant la nouvelle version)
-- ---------------------------------------------------------------------------
create or replace function public.publier_version(p_date text, p_titre text, p_points text[]) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  if p_titre is null or length(p_titre) > 200 or cardinality(p_points) > 12 then
    raise exception 'Notes de version invalides';
  end if;
  return prive.publier_discord('versions', 'version:' || coalesce(p_date, '') || ':' || p_titre, jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
    'title', 'Mise à jour · ' || p_titre,
    'url', 'https://scp-masters.vercel.app',
    'color', 13777452,
    'description', left((select string_agg('• ' || left(p, 600), E'\n') from unnest(p_points) p), 4000),
    'footer', jsonb_build_object('text', 'SCP Masters · journal des modifications')))));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Les podiums
-- ---------------------------------------------------------------------------
create or replace function prive.annoncer_podium_epreuve() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  la_semaine text := (select max(semaine) from public.epreuves_resultats);
  lignes text;
  participants int;
begin
  if la_semaine is null then
    return false;
  end if;
  select string_agg(case r.rang when 1 then '🥇' when 2 then '🥈' else '🥉' end || ' **' || p.pseudo || '** · ' || r.score || ' points', E'\n' order by r.rang)
    into lignes
    from public.epreuves_resultats r join public.profils p on p.id = r.joueur
   where r.semaine = la_semaine and r.rang <= 3;
  select count(*) into participants from public.epreuves_resultats where semaine = la_semaine;
  if lignes is null then
    return false;
  end if;
  return prive.publier_discord('podiums', 'epreuve:' || la_semaine, jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
    'title', 'Épreuve de la semaine du ' || to_char(la_semaine::date, 'DD/MM'),
    'url', 'https://scp-masters.vercel.app',
    'color', 15774780,
    'description', lignes || E'\n\n' || participants || ' agent' || case when participants > 1 then 's' else '' end || ' ont passé l’Épreuve.'))));
end $$;

create or replace function prive.annoncer_podium_saison() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  la_saison text := (select max(saison) from public.saisons_resultats);
  lignes text;
begin
  if la_saison is null then
    return false;
  end if;
  select string_agg(case r.rang when 1 then '🥇' when 2 then '🥈' else '🥉' end || ' **' || p.pseudo || '** · ' || r.elo || ' Elo', E'\n' order by r.rang)
    into lignes
    from public.saisons_resultats r join public.profils p on p.id = r.joueur
   where r.saison = la_saison and r.rang <= 3;
  if lignes is null then
    return false;
  end if;
  return prive.publier_discord('podiums', 'saison:' || la_saison, jsonb_build_object('embeds', jsonb_build_array(jsonb_build_object(
    'title', 'Saison classée ' || la_saison || ' : le podium',
    'url', 'https://scp-masters.vercel.app',
    'color', 5098239,
    'description', lignes))));
end $$;

revoke all on function prive.publier_discord(text, text, jsonb), prive.annoncer_podium_epreuve(), prive.annoncer_podium_saison() from public;
revoke execute on function public.mes_tirages(int), public.publier_version(text, text, text[]) from public, anon;
grant execute on function public.mes_tirages(int), public.publier_version(text, text, text[]) to authenticated;

-- Les tâches de clôture annoncent ensuite le podium (pas de tâche planifiée de plus)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('scp-masters-epreuve', '20 0 * * 1', 'select prive.clore_epreuve(); select prive.annoncer_podium_epreuve();');
    perform cron.schedule('scp-masters-saison', '15 0 1 * *', 'select prive.clore_saison(); select prive.annoncer_podium_saison();');
  end if;
exception when others then
  raise notice 'Annonces des podiums non planifiées : %', sqlerrm;
end $$;
