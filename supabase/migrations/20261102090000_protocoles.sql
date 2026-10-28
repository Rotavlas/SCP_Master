-- SCP Masters : cartes Protocole (type « o ») — ordres d'urgence (Patmos, Montauk), Initiatives de Réponse
-- Automatisée (IRA-1 à IRA-7), codes de confinement et scénarios de classe K. Fiches écrites à la main, rareté
-- choisie. Constantes à garder synchronisées avec src/engine/boosters.ts.
-- À exécuter dans le SQL Editor de Supabase.

-- ---------------------------------------------------------------------------
-- 1. Catalogue : nouveau type
-- ---------------------------------------------------------------------------
alter table public.cartes drop constraint if exists cartes_k_check;
alter table public.cartes add constraint cartes_k_check check (k in ('s', 'f', 'p', 'e', 'l', 'o', 'g', 'n', 'd', 'c'));

-- ---------------------------------------------------------------------------
-- 2. Boosters : les protocoles dans les mélanges
-- ---------------------------------------------------------------------------
update prive.types_boosters set
  types = case id
    when 'personnel' then '{"p":0.35,"f":0.22,"g":0.11,"n":0.09,"e":0.09,"l":0.08,"o":0.06}'::jsonb
    else '{"s":0.61,"c":0.14,"d":0.05,"p":0.06,"f":0.04,"g":0.03,"n":0.02,"e":0.02,"l":0.02,"o":0.01}'::jsonb
  end
where id in ('standard', 'personnel', 'keter', 'o5');

-- ---------------------------------------------------------------------------
-- 3. Les 31 protocoles
-- ---------------------------------------------------------------------------
insert into public.cartes (id, k, ra)
select id, 'o', 4 from unnest(array['proto:110-montauk','proto:patmos','proto:xk']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'o', 2 from unnest(array['proto:bk','proto:code-black','proto:code-gray','proto:code-magenta','proto:code-superblank','proto:ek','proto:ik','proto:ira-3','proto:ira-4','proto:ira-5','proto:ira-6','proto:ira-7','proto:lk','proto:nk','proto:sk']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'o', 3 from unnest(array['proto:ck','proto:code-coldsilver','proto:hk','proto:ira-1','proto:ira-2','proto:zk']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'o', 1 from unnest(array['proto:code-amber','proto:code-blank','proto:code-red','proto:code-superblue','proto:code-white']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'o', 0 from unnest(array['proto:code-blue','proto:code-green']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;
