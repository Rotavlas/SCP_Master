-- SCP Masters : cartes Site (type « l »), patch des équipes FIM, badges affichés à côté des pseudos.
-- Constantes à garder synchronisées avec src/engine/boosters.ts.

-- ---------------------------------------------------------------------------
-- 1. Catalogue : nouveau type
-- ---------------------------------------------------------------------------
alter table public.cartes drop constraint if exists cartes_k_check;
alter table public.cartes add constraint cartes_k_check check (k in ('s', 'f', 'p', 'e', 'l', 'g', 'n', 'd', 'c'));

-- ---------------------------------------------------------------------------
-- 2. Boosters : les sites dans les mélanges
-- ---------------------------------------------------------------------------
update prive.types_boosters set
  types = case id
    when 'personnel' then '{"p":0.37,"f":0.24,"g":0.12,"n":0.09,"e":0.09,"l":0.09}'::jsonb
    else '{"s":0.62,"c":0.14,"d":0.05,"p":0.06,"f":0.04,"g":0.03,"n":0.02,"e":0.02,"l":0.02}'::jsonb
  end
where id in ('standard', 'personnel', 'keter', 'o5');

-- ---------------------------------------------------------------------------
-- 3. Badges affichés de plusieurs agents en un appel (classements, amis, clan, messagerie)
-- ---------------------------------------------------------------------------
create function public.badges_affiches_de(p_pseudos text[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(p.pseudo, to_jsonb(prive.badges_affiches(p.id))), '{}'::jsonb)
  from public.profils p
  where p.pseudo = any ((coalesce(p_pseudos, '{}'))[1:200]) and cardinality(p.badges) > 0;
$$;

revoke execute on function public.badges_affiches_de(text[]) from public, anon;
grant execute on function public.badges_affiches_de(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Catalogue : sites et raretés changées (outils/catalogue_sql.mjs)
-- ---------------------------------------------------------------------------
insert into public.cartes (id, k, ra)
select id, 'f', 4 from unnest(array['fim:beta-1','fim:omega-1']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'f', 3 from unnest(array['fim:lambda-5','fim:tau-5']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'l', 0 from unnest(array['site:area-02','site:area-09','site:area-21','site:area-314','site:area-34','site:facility-90','site:site-0','site:site-06-3','site:site-101','site:site-104','site:site-106','site:site-107','site:site-119','site:site-138','site:site-169','site:site-188','site:site-201','site:site-222','site:site-225','site:site-228','site:site-234','site:site-246','site:site-247','site:site-300','site:site-333','site:site-38','site:site-387','site:site-400','site:site-418','site:site-433','site:site-5','site:site-50','site:site-512','site:site-62','site:site-65','site:site-69','site:site-80','site:site-84','site:site-898','site:site-95','site:site-anvil','site:site-command']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'l', 2 from unnest(array['site:area-12','site:site-11','site:site-12','site:site-22','site:site-23','site:site-37','site:site-42','site:site-45','site:site-45-2','site:site-55','site:site-59','site:site-73','site:site-76','site:site-88']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'l', 1 from unnest(array['site:area-14','site:area-179','site:area-32','site:site-103','site:site-118','site:site-13','site:site-14','site:site-18','site:site-184','site:site-28','site:site-322','site:site-34','site:site-36','site:site-41','site:site-44','site:site-54','site:site-56','site:site-58','site:site-66','site:site-666','site:site-7','site:site-78','site:site-79','site:site-83','site:site-98','site:site-theta']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'l', 3 from unnest(array['site:area-27','site:site-120','site:site-15','site:site-64','site:site-77','site:site-81','site:site-87','site:site-91']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'l', 4 from unnest(array['site:site-01','site:site-17','site:site-19','site:site-43']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;
