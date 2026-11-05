-- SCP Masters : correctifs de l'audit de sécurité.
--  1. Les pseudos sont uniques sans tenir compte des majuscules : « rotavlas » ne peut plus coexister avec « Rotavlas »
--     (la recherche par pseudo ignore la casse : un double pouvait viser le mauvais agent, ou usurper une identité).
--  2. Un code limité en nombre d'utilisations ne peut plus être dépassé par deux saisies simultanées.
--  3. Signaler un message : une fois par message, vingt signalements par jour au plus (contre le spam de signalements).
--  4. Notifications sur l'appareil : un abonnement ne peut viser qu'un vrai service de notifications (Google, Mozilla,
--     Apple, Microsoft). Sans cela, n'importe quelle adresse https recevait les requêtes du serveur (SSRF).
-- À exécuter dans le SQL Editor de Supabase, après 20261118090000_dossiers_offerts_codes.sql.
-- La dernière requête liste les pseudos en double (sans majuscules) s'il en reste : à renommer avant de relancer.

-- ---------------------------------------------------------------------------
-- 1. Pseudos uniques sans tenir compte de la casse
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select lower(pseudo) from public.profils where pseudo is not null group by lower(pseudo) having count(*) > 1) then
    create unique index if not exists profils_pseudo_sans_casse on public.profils (lower(pseudo));
  else
    raise notice 'Pseudos en double sans tenir compte de la casse : index non créé (voir la dernière requête)';
  end if;
end $$;

create or replace function public.definir_pseudo(p_pseudo text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if exists (select 1 from public.profils where lower(pseudo) = lower(trim(p_pseudo)) and id <> moi) then
    raise exception 'Ce pseudo est déjà pris' using errcode = '23505';
  end if;
  update public.profils set pseudo = trim(p_pseudo) where id = moi;
  return prive.profil_json(moi);
exception when unique_violation then
  raise exception 'Ce pseudo est déjà pris' using errcode = '23505';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Codes : la limite d'utilisations tient même sous des saisies simultanées
-- ---------------------------------------------------------------------------
create or replace function public.utiliser_code(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  saisi text := upper(trim(coalesce(p_code, '')));
  c prive.codes;
begin
  perform 1 from public.profils where id = moi for update;
  delete from prive.codes_essais where le < now() - interval '1 hour';
  if (select count(*) from prive.codes_essais where joueur = moi) >= 10 then
    raise exception 'Trop d''essais : réessayez dans une heure';
  end if;
  insert into prive.codes_essais (joueur) values (moi);
  -- Verrouillé : deux agents qui saisissent le dernier exemplaire d'un code en même temps ne le dépassent pas
  select * into c from prive.codes where code = saisi for update;
  if not found or (c.expire_le is not null and c.expire_le < now())
     or (c.utilisations_max is not null and (select count(*) from prive.codes_utilises where code = c.code) >= c.utilisations_max) then
    -- Pas d'exception ici : elle effacerait l'essai compté plus haut
    return jsonb_build_object('erreur', 'Code inconnu ou expiré');
  end if;
  insert into prive.codes_utilises (code, joueur) values (c.code, moi) on conflict do nothing;
  if not found then
    raise exception 'Vous avez déjà utilisé ce code';
  end if;
  perform prive.remettre_recompense(moi, c.recompense, c.code);
  return jsonb_build_object('recompense', c.recompense, 'description', c.description, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Signalements : une fois par message, vingt par jour
-- ---------------------------------------------------------------------------
create or replace function public.signaler_message(p_message bigint, p_raison text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  m public.messages;
begin
  select * into m from public.messages where id = p_message;
  if not found or not public.peut_lire_salon(m.salon) then
    raise exception 'Message introuvable';
  end if;
  if exists (select 1 from prive.signalements where signaleur = moi and message = m.id) then
    return true;
  end if;
  if (select count(*) from prive.signalements where signaleur = moi and le > now() - interval '1 day') >= 20 then
    raise exception 'Vingt signalements par jour au plus';
  end if;
  insert into prive.signalements (signaleur, message, auteur, texte, raison)
    values (moi, m.id, m.auteur, m.texte, left(coalesce(p_raison, ''), 300));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Abonnements aux notifications : seulement les services de notifications des navigateurs
-- ---------------------------------------------------------------------------
create or replace function prive.service_push_connu(p_endpoint text) returns boolean
language sql immutable as $$
  select p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/';
$$;

create or replace function public.abonner_push(p_endpoint text, p_p256dh text, p_auth text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if not prive.service_push_connu(coalesce(p_endpoint, '')) or length(p_endpoint) > 1000
     or length(p_p256dh) not between 80 and 100 or length(p_auth) not between 16 and 30 then
    raise exception 'Abonnement invalide';
  end if;
  insert into prive.abonnements_push (endpoint, joueur, p256dh, auth) values (p_endpoint, moi, p_p256dh, p_auth)
  on conflict (endpoint) do update set joueur = moi, p256dh = excluded.p256dh, auth = excluded.auth, cree_le = now();
  delete from prive.abonnements_push where joueur = moi and endpoint not in (
    select endpoint from prive.abonnements_push where joueur = moi order by cree_le desc limit 5);
  return true;
end $$;

-- Les abonnements déjà enregistrés vers une adresse inconnue sont retirés
delete from prive.abonnements_push where not prive.service_push_connu(endpoint);

-- ---------------------------------------------------------------------------
-- Les pseudos encore en double sans tenir compte de la casse (normalement : aucun)
-- ---------------------------------------------------------------------------
select lower(pseudo) as pseudo_en_double, string_agg(pseudo, ', ') as variantes, count(*) as nombre
  from public.profils where pseudo is not null group by lower(pseudo) having count(*) > 1;
