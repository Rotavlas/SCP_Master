-- SCP Masters : les notifications sur l'appareil partent dès que le jeu n'est plus à l'écran.
--  1. Jusqu'ici, rien ne partait tant que l'agent était « en ligne », c'est-à-dire jusqu'à 3 minutes après avoir quitté
--     l'application (le signal de présence ne passe qu'une fois par minute) : une surenchère juste après la fermeture
--     de l'appli n'arrivait jamais sur le téléphone. Désormais, le jeu signale lui-même quand il est à l'écran (toutes
--     les 30 secondes) et quand il le quitte ; une notification part dès qu'il n'y est plus (75 secondes au plus sans
--     signal, si le téléphone a coupé l'application sans prévenir).
--  2. Une notification d'essai, depuis le menu du compte, pour vérifier un appareil (une par minute au plus).
-- À exécuter dans le SQL Editor de Supabase, après 20261115090000_registre_fusion_cote_collections_push.sql.

alter table public.profils add column if not exists premier_plan_le timestamptz;
alter table public.profils add column if not exists essai_push_le timestamptz;

-- Le jeu est à l'écran (p_actif), ou vient de le quitter
create or replace function public.premier_plan(p_actif boolean) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.profils set premier_plan_le = case when p_actif then now() end where id = prive.joueur();
$$;

create or replace function prive.au_premier_plan(p_joueur uuid) returns boolean
language sql stable as $$
  select coalesce((select premier_plan_le > now() - interval '75 seconds' from public.profils where id = p_joueur), false);
$$;

create or replace function prive.pousser_notification() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from prive.abonnements_push where joueur = new.joueur) and not prive.au_premier_plan(new.joueur) then
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
     and not exists (select 1 from prive.push_file where joueur = dest and type = 'message' and donnees ->> 'de' = new.pseudo) then
    insert into prive.push_file (joueur, type, donnees)
      values (dest, 'message', jsonb_build_object('de', new.pseudo, 'texte', left(new.texte, 120)));
  end if;
  return null;
end $$;

-- Une notification d'essai vers tous les appareils de l'agent ; renvoie leur nombre
create or replace function public.essai_push() returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  n int;
begin
  select count(*) into n from prive.abonnements_push where joueur = moi;
  if n = 0 then
    raise exception 'Aucun appareil abonné : activez d''abord les notifications sur cet appareil';
  end if;
  if exists (select 1 from public.profils where id = moi and essai_push_le > now() - interval '1 minute') then
    raise exception 'Une notification d''essai par minute au plus';
  end if;
  update public.profils set essai_push_le = now() where id = moi;
  insert into prive.push_file (joueur, type, donnees) values (moi, 'essai', '{}');
  return n;
end $$;

revoke execute on function public.premier_plan(boolean), public.essai_push() from public, anon;
grant execute on function public.premier_plan(boolean), public.essai_push() to authenticated;
