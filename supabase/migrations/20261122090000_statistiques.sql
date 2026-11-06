-- SCP Masters : statistiques personnelles (page Succès → « Performance »).
-- Le navigateur compte ses réponses par famille de questions (classe, surnom, extrait, illustration…) et envoie le
-- cumul une fois par combat (pas un appel par réponse : l'offre gratuite de Supabase compte les appels). Rien ne se
-- gagne avec ces chiffres : ils sont bornés à chaque envoi, sans plus de contrôle.
-- À exécuter dans le SQL Editor de Supabase, après 20261121090000_dossiers_annonces.sql.

alter table public.profils add column if not exists statistiques jsonb not null default '{}';

create or replace function public.ajouter_statistiques(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  s jsonb;
  f record;
  n int;
  b int;
  t numeric;
  envoyees int := 0;
begin
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(coalesce(p -> 'familles', '{}')) <> 'object' then
    raise exception 'Statistiques invalides';
  end if;
  select coalesce(statistiques, '{}') into s from public.profils where id = moi for update;
  if not s ? 'familles' then
    s := s || '{"familles": {}}';
  end if;
  for f in select key, value from jsonb_each(coalesce(p -> 'familles', '{}')) limit 20 loop
    continue when f.key !~ '^[a-z]{3,14}$' or jsonb_typeof(f.value) <> 'object';
    -- Une famille de plus au-delà de vingt : ignorée
    continue when not (s -> 'familles') ? f.key and (select count(*) from jsonb_object_keys(s -> 'familles')) >= 20;
    n := least(greatest(coalesce((f.value ->> 'n')::numeric, 0), 0), 60)::int;
    continue when n = 0 or envoyees + n > 120;
    envoyees := envoyees + n;
    b := least(greatest(coalesce((f.value ->> 'b')::numeric, 0), 0)::int, n);
    t := least(greatest(coalesce((f.value ->> 't')::numeric, 0), 0), n * 40);
    s := jsonb_set(s, array['familles', f.key], jsonb_build_object(
      'n', coalesce((s #>> array['familles', f.key, 'n'])::int, 0) + n,
      'b', coalesce((s #>> array['familles', f.key, 'b'])::int, 0) + b,
      't', round(coalesce((s #>> array['familles', f.key, 't'])::numeric, 0) + t, 1)));
  end loop;
  -- La meilleure série de bonnes réponses d'affilée, et la bonne réponse la plus rapide
  if jsonb_typeof(p -> 'serie') = 'number' then
    s := jsonb_set(s, '{serie}', to_jsonb(greatest(coalesce((s ->> 'serie')::int, 0), least((p ->> 'serie')::numeric, 200)::int)));
  end if;
  if jsonb_typeof(p -> 'eclair') = 'number' and (p ->> 'eclair')::numeric >= 0.3 then
    s := jsonb_set(s, '{eclair}', to_jsonb(round(least(coalesce((s ->> 'eclair')::numeric, 999), (p ->> 'eclair')::numeric), 2)));
  end if;
  update public.profils set statistiques = s where id = moi;
  return s;
end $$;

create or replace function public.mes_statistiques() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select statistiques from public.profils where id = prive.joueur();
$$;

revoke execute on function public.ajouter_statistiques(jsonb), public.mes_statistiques() from public, anon;
grant execute on function public.ajouter_statistiques(jsonb), public.mes_statistiques() to authenticated;
