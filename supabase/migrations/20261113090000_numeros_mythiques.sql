-- SCP Masters : les numéros des Mythiques qu'on possède, pour les afficher sur la carte (« N° 07 / 50 »).
-- À exécuter dans le SQL Editor de Supabase, après 20261112090000_correctifs_raid_album.sql.

-- {"entite:scarlet-king": [7, 31], …} : chaque Mythique possédée et les numéros de ses exemplaires, du plus petit au
-- plus grand (le plus petit, le plus prestigieux, est celui qu'on montre)
create or replace function public.mes_numeros_mythiques() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(carte_id, numeros), '{}'::jsonb)
    from (select x.carte_id, jsonb_agg(x.numero_serie order by x.numero_serie) as numeros
            from public.exemplaires x join public.cartes c on c.id = x.carte_id
           where x.proprietaire = prive.joueur() and c.ra = 5 and x.numero_serie is not null
           group by x.carte_id) m;
$$;

revoke execute on function public.mes_numeros_mythiques() from public, anon;
grant execute on function public.mes_numeros_mythiques() to authenticated;
