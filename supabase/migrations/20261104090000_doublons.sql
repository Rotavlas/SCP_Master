-- SCP Masters : recycler ou brûler ses doublons garde toujours un exemplaire standard. Auparavant, un exemplaire en
-- variante (holographique, brèche…) comptait comme l'exemplaire gardé, et le dernier standard partait.
-- Règle à garder synchronisée avec doublonsRecyclables (src/state/sauvegarde.ts).
-- À exécuter dans le SQL Editor de Supabase.

create or replace function prive.recycler(p_joueur uuid, p_carte text) returns int
language plpgsql volatile as $$
declare
  libres int;
  recyclables int;
  a_recycler int;
  rarete int;
  gain int;
begin
  -- On garde toujours un exemplaire standard : une variante ne compte jamais comme l'exemplaire gardé
  select count(*) filter (where variante = 'std'),
         count(*) filter (where variante = 'std' and origine <> 'souvenir' and bloque_par is null)
    into libres, recyclables
    from public.exemplaires where proprietaire = p_joueur and carte_id = p_carte;
  a_recycler := greatest(least(recyclables, libres - 1), 0);
  if a_recycler = 0 then
    return 0;
  end if;
  select ra into rarete from public.cartes where id = p_carte;
  gain := a_recycler * (array[5, 12, 35, 90, 300, 2500])[rarete + 1];
  delete from public.exemplaires where id in (
    select id from public.exemplaires
    where proprietaire = p_joueur and carte_id = p_carte and variante = 'std' and origine <> 'souvenir' and bloque_par is null
    order by numero_serie desc nulls first
    limit a_recycler);
  update public.profils set credits = credits + gain where id = p_joueur;
  insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, gain, 'recyclage', p_carte);
  return gain;
end $$;

create or replace function public.bruler_lot(p_cartes text[], p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  carte text;
  total int;
  libres int;
  nombre int;
  valeur int;
  gain bigint := 0;
  detruits int := 0;
begin
  if p_mode not in ('un', 'doublons', 'tous') then
    raise exception 'Mode de brûlage inconnu';
  end if;
  if cardinality(p_cartes) > 500 then
    raise exception 'Trop de dossiers à la fois (500 au plus)';
  end if;
  perform 1 from public.profils where id = moi for update;
  for carte in select distinct c from unnest(coalesce(p_cartes, '{}')) c loop
    -- « Doublons » : on garde toujours un exemplaire standard (une variante ne compte pas comme l'exemplaire gardé)
    select count(*) filter (where variante = case when p_mode = 'doublons' then 'std' else variante end),
           count(*) filter (where variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir')
      into total, libres
      from public.exemplaires where proprietaire = moi and carte_id = carte;
    nombre := case p_mode when 'un' then least(libres, 1) when 'doublons' then least(libres, total - 1) else libres end;
    continue when nombre <= 0;
    select prive.valeur_brulage(c.ra, 'std') into valeur from public.cartes c where c.id = carte;
    delete from public.exemplaires where id in (
      select id from public.exemplaires
      where proprietaire = moi and carte_id = carte and variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir'
      order by numero_serie desc nulls last, obtenu_le desc
      limit nombre);
    perform prive.crediter(moi, (nombre * valeur)::bigint, 'brulage', carte || ':std');
    gain := gain + nombre * valeur;
    detruits := detruits + nombre;
  end loop;
  perform prive.nettoyer_equipe(moi);
  return jsonb_build_object('gain', gain, 'detruits', detruits, 'profil', prive.profil_json(moi));
end $$;
