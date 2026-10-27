-- SCP Masters : classements, profils publics, amis, clans, messagerie et duels entre joueurs.
-- Comme partout ailleurs, le navigateur n'écrit dans aucune table : il appelle les fonctions ci-dessous.
-- Les duels entre joueurs sont arbitrés par la fonction Edge « duel » (clé de service) ; leur état
-- public est diffusé en direct aux deux joueurs, la bonne réponse reste dans le schéma privé.

-- ---------------------------------------------------------------------------
-- 1. Profil public : Elo, bilan des duels entre joueurs, vitrine, présence
-- ---------------------------------------------------------------------------
alter table public.profils
  add column elo int not null default 1000,
  add column jcj jsonb not null default '{"victoires":0,"defaites":0,"nuls":0}',
  add column vitrine text[] not null default '{}',
  add column vu_le timestamptz not null default now();
create index profils_elo on public.profils (elo desc);

-- Un joueur est « en ligne » s'il a donné signe de vie dans les 3 dernières minutes
create function prive.en_ligne(p_vu timestamptz) returns boolean
language sql stable as $$ select p_vu > now() - interval '3 minutes' $$;

create function prive.id_du_pseudo(p_pseudo text) returns uuid
language plpgsql stable as $$
declare
  resultat uuid;
begin
  select id into resultat from public.profils where lower(pseudo) = lower(trim(p_pseudo));
  if resultat is null then
    raise exception 'Agent introuvable';
  end if;
  return resultat;
end $$;

-- Le jeu le rappelle toutes les minutes tant que la page est ouverte
create function public.signaler_presence() returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update public.profils set vu_le = now() where id = prive.joueur() and vu_le < now() - interval '30 seconds';
end $$;

-- Jusqu'à 5 cartes possédées, montrées sur le profil public
create function public.maj_vitrine(p_cartes text[]) returns text[]
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  cartes text[] := (select coalesce(array_agg(distinct c), '{}') from unnest(coalesce(p_cartes, '{}')) c);
begin
  if cardinality(cartes) > 5 or exists (
    select 1 from unnest(cartes) c
    where not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = c)) then
    raise exception 'La vitrine ne montre que 5 cartes possédées';
  end if;
  update public.profils set vitrine = cartes where id = moi;
  return cartes;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Amis et blocages
-- ---------------------------------------------------------------------------
-- Une ligne par paire : « de » a fait la demande ; statut « ami » une fois acceptée
create table prive.amities (
  de uuid not null references public.profils on delete cascade,
  vers uuid not null references public.profils on delete cascade,
  statut text not null check (statut in ('demande', 'ami')),
  cree_le timestamptz not null default now(),
  primary key (de, vers),
  check (de <> vers)
);
create index amities_vers on prive.amities (vers);

create table prive.blocages (
  joueur uuid not null references public.profils on delete cascade,
  bloque uuid not null references public.profils on delete cascade,
  primary key (joueur, bloque)
);

create function prive.sont_amis(p_a uuid, p_b uuid) returns boolean
language sql stable as $$
  select exists (select 1 from prive.amities
                 where statut = 'ami' and ((de = p_a and vers = p_b) or (de = p_b and vers = p_a)));
$$;

create function prive.bloque(p_a uuid, p_b uuid) returns boolean
language sql stable as $$
  select exists (select 1 from prive.blocages where (joueur = p_a and bloque = p_b) or (joueur = p_b and bloque = p_a));
$$;

create function public.demander_ami(p_pseudo text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  lui uuid := prive.id_du_pseudo(p_pseudo);
begin
  if lui = moi then
    raise exception 'Impossible de s''ajouter soi-même';
  end if;
  if prive.bloque(moi, lui) then
    raise exception 'Impossible d''ajouter cet agent';
  end if;
  if prive.sont_amis(moi, lui) then
    raise exception 'Vous êtes déjà amis';
  end if;
  -- Il nous avait déjà demandé : c'est accepté
  update prive.amities set statut = 'ami' where de = lui and vers = moi and statut = 'demande';
  if found then
    return 'ami';
  end if;
  if (select count(*) from prive.amities where (de = moi or vers = moi) and statut = 'ami') >= 200 then
    raise exception 'Liste d''amis pleine (200)';
  end if;
  if (select count(*) from prive.amities where de = moi and statut = 'demande') >= 50 then
    raise exception 'Trop de demandes en attente';
  end if;
  insert into prive.amities (de, vers, statut) values (moi, lui, 'demande') on conflict do nothing;
  return 'demande';
end $$;

create function public.repondre_ami(p_pseudo text, p_accepter boolean) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  lui uuid := prive.id_du_pseudo(p_pseudo);
begin
  if p_accepter then
    update prive.amities set statut = 'ami' where de = lui and vers = moi and statut = 'demande';
  else
    delete from prive.amities where de = lui and vers = moi and statut = 'demande';
  end if;
  if not found then
    raise exception 'Aucune demande de cet agent';
  end if;
  return p_accepter;
end $$;

-- Retire un ami, ou annule sa propre demande
create function public.retirer_ami(p_pseudo text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  lui uuid := prive.id_du_pseudo(p_pseudo);
begin
  delete from prive.amities where (de = moi and vers = lui) or (de = lui and vers = moi and statut = 'ami');
  return found;
end $$;

create function public.bloquer(p_pseudo text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  lui uuid := prive.id_du_pseudo(p_pseudo);
begin
  if lui = moi then
    raise exception 'Impossible de se bloquer soi-même';
  end if;
  delete from prive.amities where (de = moi and vers = lui) or (de = lui and vers = moi);
  insert into prive.blocages values (moi, lui) on conflict do nothing;
  return true;
end $$;

create function public.debloquer(p_pseudo text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  delete from prive.blocages where joueur = prive.joueur() and bloque = prive.id_du_pseudo(p_pseudo);
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Clans
-- ---------------------------------------------------------------------------
create table prive.clans (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique check (nom ~ '^[[:alnum:]À-ÿ _.''-]{3,30}$'),
  tag text not null unique check (tag ~ '^[A-Z0-9]{2,4}$'),
  description text not null default '' check (length(description) <= 300),
  -- Une carte du catalogue sert d'emblème
  embleme text references public.cartes,
  ouvert boolean not null default true,
  cree_le timestamptz not null default now()
);

create table prive.membres_clan (
  joueur uuid primary key references public.profils on delete cascade,
  clan uuid not null references prive.clans on delete cascade,
  role text not null check (role in ('chef', 'officier', 'membre')),
  rejoint_le timestamptz not null default now()
);
create index membres_clan_clan on prive.membres_clan (clan);

create table prive.candidatures (
  clan uuid not null references prive.clans on delete cascade,
  joueur uuid not null references public.profils on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (clan, joueur)
);

-- Création : 2 000 crédits ; 30 membres au plus
create function prive.cout_clan() returns int language sql immutable as $$ select 2000 $$;
create function prive.max_membres() returns int language sql immutable as $$ select 30 $$;

create function prive.ajouter_membre(p_clan uuid, p_joueur uuid, p_role text) returns void
language plpgsql volatile as $$
begin
  if exists (select 1 from prive.membres_clan where joueur = p_joueur) then
    raise exception 'Cet agent fait déjà partie d''un clan';
  end if;
  if (select count(*) from prive.membres_clan where clan = p_clan) >= prive.max_membres() then
    raise exception 'Le clan est complet (30 membres)';
  end if;
  insert into prive.membres_clan (joueur, clan, role) values (p_joueur, p_clan, p_role);
  delete from prive.candidatures where joueur = p_joueur;
end $$;

-- Départ d'un membre ; si c'était le chef, le plus ancien officier (sinon membre) prend la tête,
-- et un clan vide disparaît
create function prive.quitter_clan(p_joueur uuid) returns void
language plpgsql volatile as $$
declare
  m prive.membres_clan;
  successeur uuid;
begin
  select * into m from prive.membres_clan where joueur = p_joueur for update;
  if not found then
    return;
  end if;
  delete from prive.membres_clan where joueur = p_joueur;
  if m.role = 'chef' then
    select joueur into successeur from prive.membres_clan where clan = m.clan
     order by role = 'officier' desc, rejoint_le limit 1;
    if successeur is null then
      delete from prive.clans where id = m.clan;
    else
      update prive.membres_clan set role = 'chef' where joueur = successeur;
    end if;
  end if;
end $$;

create function public.creer_clan(p_nom text, p_tag text, p_description text, p_ouvert boolean) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  id_clan uuid;
begin
  perform 1 from public.profils where id = moi for update;
  if exists (select 1 from prive.membres_clan where joueur = moi) then
    raise exception 'Quittez d''abord votre clan actuel';
  end if;
  if (select credits from public.profils where id = moi) < prive.cout_clan() then
    raise exception 'Il faut 2 000 crédits pour fonder un clan';
  end if;
  insert into prive.clans (nom, tag, description, ouvert)
    values (trim(p_nom), upper(trim(p_tag)), left(trim(coalesce(p_description, '')), 300), coalesce(p_ouvert, true))
    returning id into id_clan;
  perform prive.ajouter_membre(id_clan, moi, 'chef');
  perform prive.crediter(moi, -prive.cout_clan(), 'clan', id_clan::text);
  return upper(trim(p_tag));
exception
  when unique_violation then
    raise exception 'Ce nom ou ce tag de clan est déjà pris';
  when check_violation then
    raise exception 'Nom (3 à 30 caractères) ou tag (2 à 4 lettres ou chiffres) invalide';
end $$;

-- Clan ouvert : on entre directement. Fermé : candidature, à valider par le chef ou un officier.
create function public.rejoindre_clan(p_tag text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  c prive.clans;
begin
  select * into c from prive.clans where tag = upper(trim(p_tag)) for update;
  if not found then
    raise exception 'Clan introuvable';
  end if;
  if exists (select 1 from prive.membres_clan where joueur = moi) then
    raise exception 'Quittez d''abord votre clan actuel';
  end if;
  if c.ouvert then
    perform prive.ajouter_membre(c.id, moi, 'membre');
    return 'membre';
  end if;
  if (select count(*) from prive.candidatures where joueur = moi) >= 5 then
    raise exception 'Trop de candidatures en attente';
  end if;
  insert into prive.candidatures (clan, joueur) values (c.id, moi) on conflict do nothing;
  return 'candidature';
end $$;

create function public.quitter_clan() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if not exists (select 1 from prive.membres_clan where joueur = moi) then
    -- Retire aussi ses candidatures en attente
    delete from prive.candidatures where joueur = moi;
    return found;
  end if;
  perform prive.quitter_clan(moi);
  return true;
end $$;

-- accepter / refuser (candidature), exclure, promouvoir, retrograder, chef (passer la main)
create function public.gerer_membre(p_pseudo text, p_action text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  lui uuid := prive.id_du_pseudo(p_pseudo);
  mon prive.membres_clan;
  son prive.membres_clan;
begin
  select * into mon from prive.membres_clan where joueur = moi;
  if not found or mon.role = 'membre' then
    raise exception 'Réservé au chef et aux officiers du clan';
  end if;
  perform 1 from prive.clans where id = mon.clan for update;
  if p_action in ('accepter', 'refuser') then
    if not exists (select 1 from prive.candidatures where clan = mon.clan and joueur = lui) then
      raise exception 'Aucune candidature de cet agent';
    end if;
    delete from prive.candidatures where clan = mon.clan and joueur = lui;
    if p_action = 'accepter' then
      perform prive.ajouter_membre(mon.clan, lui, 'membre');
    end if;
    return true;
  end if;
  select * into son from prive.membres_clan where joueur = lui and clan = mon.clan;
  if not found or lui = moi then
    raise exception 'Cet agent ne fait pas partie de votre clan';
  end if;
  if p_action = 'exclure' then
    -- Un officier n'exclut que des membres ; le chef exclut tout le monde
    if mon.role = 'officier' and son.role <> 'membre' then
      raise exception 'Seul le chef peut exclure un officier';
    end if;
    delete from prive.membres_clan where joueur = lui;
  elsif mon.role <> 'chef' then
    raise exception 'Réservé au chef du clan';
  elsif p_action = 'promouvoir' then
    update prive.membres_clan set role = 'officier' where joueur = lui;
  elsif p_action = 'retrograder' then
    update prive.membres_clan set role = 'membre' where joueur = lui;
  elsif p_action = 'chef' then
    update prive.membres_clan set role = 'officier' where joueur = moi;
    update prive.membres_clan set role = 'chef' where joueur = lui;
  else
    raise exception 'Action inconnue';
  end if;
  return true;
end $$;

create function public.modifier_clan(p_description text, p_ouvert boolean, p_embleme text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  mon prive.membres_clan;
begin
  select * into mon from prive.membres_clan where joueur = prive.joueur();
  if not found or mon.role <> 'chef' then
    raise exception 'Réservé au chef du clan';
  end if;
  if p_embleme is not null and not exists (select 1 from public.cartes where id = p_embleme) then
    raise exception 'Emblème inconnu';
  end if;
  update prive.clans set description = left(trim(coalesce(p_description, '')), 300), ouvert = coalesce(p_ouvert, ouvert),
    embleme = coalesce(p_embleme, embleme)
   where id = mon.clan;
  return true;
end $$;

-- Score d'un clan : victoires de ses membres en duel entre joueurs
create function prive.score_clan(p_clan uuid) returns bigint
language sql stable as $$
  select coalesce(sum((p.jcj ->> 'victoires')::int), 0)
  from prive.membres_clan m join public.profils p on p.id = m.joueur where m.clan = p_clan;
$$;

create function public.liste_clans(p_recherche text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(c order by (c ->> 'score')::bigint desc, c ->> 'nom'), '[]'::jsonb) from (
    select jsonb_build_object('nom', c.nom, 'tag', c.tag, 'description', c.description, 'embleme', c.embleme,
      'ouvert', c.ouvert, 'membres', (select count(*) from prive.membres_clan m where m.clan = c.id),
      'score', prive.score_clan(c.id)) as c
    from prive.clans c
    where coalesce(trim(p_recherche), '') = ''
       or lower(c.nom) like '%' || lower(replace(replace(replace(trim(p_recherche), '\', '\\'), '%', '\%'), '_', '\_')) || '%'
       or c.tag = upper(trim(p_recherche))
    order by prive.score_clan(c.id) desc, c.nom
    limit 50) l;
$$;

-- Fiche d'un clan (le sien si p_tag est vide), avec les candidatures pour son chef et ses officiers
create function public.fiche_clan(p_tag text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  c prive.clans;
  mon_role text;
begin
  if coalesce(trim(p_tag), '') = '' then
    select k.* into c from prive.clans k join prive.membres_clan m on m.clan = k.id where m.joueur = moi;
    if not found then
      return jsonb_build_object('candidatures', coalesce((
        select jsonb_agg(k.tag) from prive.candidatures d join prive.clans k on k.id = d.clan where d.joueur = moi), '[]'::jsonb));
    end if;
  else
    select * into c from prive.clans where tag = upper(trim(p_tag));
    if not found then
      raise exception 'Clan introuvable';
    end if;
  end if;
  select role into mon_role from prive.membres_clan where joueur = moi and clan = c.id;
  return jsonb_build_object(
    'nom', c.nom, 'tag', c.tag, 'description', c.description, 'embleme', c.embleme, 'ouvert', c.ouvert,
    'creeLe', c.cree_le, 'score', prive.score_clan(c.id), 'monRole', mon_role,
    'candidat', exists (select 1 from prive.candidatures where clan = c.id and joueur = moi),
    'membres', (
      select jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'role', m.role, 'elo', p.elo,
        'victoires', (p.jcj ->> 'victoires')::int, 'enLigne', prive.en_ligne(p.vu_le))
        order by array_position(array['chef', 'officier', 'membre'], m.role), p.elo desc)
      from prive.membres_clan m join public.profils p on p.id = m.joueur where m.clan = c.id),
    'candidatures', case when mon_role in ('chef', 'officier') then coalesce((
      select jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'elo', p.elo) order by d.cree_le)
      from prive.candidatures d join public.profils p on p.id = d.joueur where d.clan = c.id), '[]'::jsonb) end);
end $$;

create function public.mes_amis() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with moi as (select prive.joueur() as id)
  select jsonb_build_object(
    'amis', coalesce((
      select jsonb_agg(jsonb_build_object(
        'pseudo', p.pseudo, 'elo', p.elo, 'enLigne', prive.en_ligne(p.vu_le), 'vuLe', p.vu_le,
        'clan', (select c.tag from prive.membres_clan m join prive.clans c on c.id = m.clan where m.joueur = p.id))
        order by prive.en_ligne(p.vu_le) desc, lower(p.pseudo))
      from prive.amities a join public.profils p on p.id = case when a.de = (select id from moi) then a.vers else a.de end
      where a.statut = 'ami' and (select id from moi) in (a.de, a.vers)), '[]'::jsonb),
    'recues', coalesce((
      select jsonb_agg(p.pseudo order by a.cree_le desc)
      from prive.amities a join public.profils p on p.id = a.de
      where a.vers = (select id from moi) and a.statut = 'demande'), '[]'::jsonb),
    'envoyees', coalesce((
      select jsonb_agg(p.pseudo order by a.cree_le desc)
      from prive.amities a join public.profils p on p.id = a.vers
      where a.de = (select id from moi) and a.statut = 'demande'), '[]'::jsonb),
    'bloques', coalesce((
      select jsonb_agg(p.pseudo order by lower(p.pseudo))
      from prive.blocages b join public.profils p on p.id = b.bloque
      where b.joueur = (select id from moi)), '[]'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- 4. Messagerie : salon de clan (« clan:<id> ») et messages privés entre amis (« mp:<id>:<id> »)
-- ---------------------------------------------------------------------------
create table public.messages (
  id bigserial primary key,
  salon text not null,
  auteur uuid references public.profils on delete set null,
  pseudo text not null,
  texte text not null check (length(texte) between 1 and 500),
  cree_le timestamptz not null default now()
);
create index messages_salon on public.messages (salon, id desc);
create index messages_auteur on public.messages (auteur, cree_le desc);

create table prive.lectures (
  joueur uuid not null references public.profils on delete cascade,
  salon text not null,
  dernier bigint not null default 0,
  primary key (joueur, salon)
);

create table prive.signalements (
  id bigserial primary key,
  signaleur uuid references public.profils on delete set null,
  message bigint,
  auteur uuid,
  texte text,
  raison text,
  le timestamptz not null default now()
);

create function prive.salon_mp(p_a uuid, p_b uuid) returns text
language sql immutable as $$ select 'mp:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text $$;

-- Utilisée par la règle de lecture (et donc par le direct) : membre du clan, ou l'un des deux du message privé
create function public.peut_lire_salon(p_salon text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_salon like 'clan:%' then exists (
      select 1 from prive.membres_clan where joueur = auth.uid() and clan::text = substr(p_salon, 6))
    when p_salon like 'mp:%' then auth.uid()::text in (split_part(p_salon, ':', 2), split_part(p_salon, ':', 3))
    else false end;
$$;

alter table public.messages enable row level security;
create policy "salons lisibles" on public.messages for select to authenticated using (public.peut_lire_salon(salon));
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

-- Le salon d'une conversation : celui de son clan, ou le message privé avec un ami
create function prive.salon(p_moi uuid, p_type text, p_cible text) returns text
language plpgsql stable as $$
declare
  clan_id uuid;
  lui uuid;
begin
  if p_type = 'clan' then
    select clan into clan_id from prive.membres_clan where joueur = p_moi;
    if clan_id is null then
      raise exception 'Vous ne faites partie d''aucun clan';
    end if;
    return 'clan:' || clan_id::text;
  elsif p_type = 'mp' then
    lui := prive.id_du_pseudo(p_cible);
    if not prive.sont_amis(p_moi, lui) or prive.bloque(p_moi, lui) then
      raise exception 'Les messages privés sont réservés à vos amis';
    end if;
    return prive.salon_mp(p_moi, lui);
  end if;
  raise exception 'Conversation inconnue';
end $$;

create function public.envoyer_message(p_type text, p_cible text, p_texte text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  le_salon text := prive.salon(moi, p_type, p_cible);
  -- Caractères de contrôle retirés, espaces de bord coupés
  propre text := trim(regexp_replace(coalesce(p_texte, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  m public.messages;
begin
  if length(propre) = 0 then
    raise exception 'Message vide';
  end if;
  if length(propre) > 500 then
    raise exception 'Message trop long (500 caractères au plus)';
  end if;
  if (select count(*) from public.messages where auteur = moi and cree_le > now() - interval '10 seconds') >= 5 then
    raise exception 'Doucement : attendez quelques secondes';
  end if;
  insert into public.messages (salon, auteur, pseudo, texte)
    values (le_salon, moi, (select pseudo from public.profils where id = moi), propre) returning * into m;
  insert into prive.lectures (joueur, salon, dernier) values (moi, le_salon, m.id)
    on conflict (joueur, salon) do update set dernier = excluded.dernier;
  return jsonb_build_object('id', m.id, 'salon', m.salon, 'pseudo', m.pseudo, 'texte', m.texte, 'creeLe', m.cree_le, 'moi', true);
end $$;

-- Les 50 messages précédant p_avant (les plus récents sinon), sans ceux des agents bloqués ; marque le salon comme lu
create function public.messages_salon(p_type text, p_cible text, p_avant bigint) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  le_salon text := prive.salon(moi, p_type, p_cible);
  dernier_id bigint;
begin
  select max(id) into dernier_id from public.messages where salon = le_salon;
  if dernier_id is not null and p_avant is null then
    insert into prive.lectures (joueur, salon, dernier) values (moi, le_salon, dernier_id)
      on conflict (joueur, salon) do update set dernier = greatest(prive.lectures.dernier, excluded.dernier);
  end if;
  return jsonb_build_object('salon', le_salon, 'messages', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'pseudo', m.pseudo, 'texte', m.texte, 'creeLe', m.cree_le,
      'moi', m.auteur = moi) order by m.id)
    from (select * from public.messages
          where salon = le_salon and (p_avant is null or id < p_avant)
            and (auteur is null or not exists (select 1 from prive.blocages b where b.joueur = moi and b.bloque = auteur))
          order by id desc limit 50) m), '[]'::jsonb));
end $$;

-- Conversations privées et salon du clan, avec le nombre de messages non lus
create function public.conversations() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with moi as (select prive.joueur() as id),
  salons as (
    select 'mp' as type, p.pseudo as cible, prive.salon_mp((select id from moi), p.id) as salon, prive.en_ligne(p.vu_le) as en_ligne
    from prive.amities a join public.profils p on p.id = case when a.de = (select id from moi) then a.vers else a.de end
    where a.statut = 'ami' and (select id from moi) in (a.de, a.vers)
    union all
    select 'clan', c.tag, 'clan:' || c.id::text, null
    from prive.membres_clan m join prive.clans c on c.id = m.clan where m.joueur = (select id from moi))
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', s.type, 'cible', s.cible, 'enLigne', s.en_ligne,
    'dernier', (select jsonb_build_object('pseudo', m.pseudo, 'texte', left(m.texte, 80), 'creeLe', m.cree_le)
                from public.messages m where m.salon = s.salon order by m.id desc limit 1),
    'nonLus', (select count(*) from public.messages m
               where m.salon = s.salon and m.auteur is distinct from (select id from moi)
                 and m.id > coalesce((select l.dernier from prive.lectures l where l.joueur = (select id from moi) and l.salon = s.salon), 0)))
    order by s.type desc, s.cible), '[]'::jsonb)
  from salons s;
$$;

create function public.signaler_message(p_message bigint, p_raison text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  m public.messages;
begin
  select * into m from public.messages where id = p_message;
  if not found or not public.peut_lire_salon(m.salon) then
    raise exception 'Message introuvable';
  end if;
  insert into prive.signalements (signaleur, message, auteur, texte, raison)
    values (moi, m.id, m.auteur, m.texte, left(coalesce(p_raison, ''), 300));
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Classements et profil public
-- ---------------------------------------------------------------------------
create function prive.valeur_classement(p_joueur uuid, p_tableau text) returns bigint
language sql stable as $$
  select case p_tableau
    when 'elo' then p.elo
    when 'richesse' then p.credits
    when 'xp' then p.xp
    when 'victoires' then (p.jcj ->> 'victoires')::bigint
    when 'collection' then (select count(distinct carte_id) from public.exemplaires where proprietaire = p.id)
    when 'legendaires' then (select count(distinct x.carte_id) from public.exemplaires x join public.cartes c on c.id = x.carte_id
                             where x.proprietaire = p.id and c.ra = 4)
  end
  from public.profils p where p.id = p_joueur;
$$;

-- Les 100 premiers d'un tableau, et la place du joueur
create function public.classement(p_tableau text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if p_tableau not in ('elo', 'richesse', 'xp', 'victoires', 'collection', 'legendaires') then
    raise exception 'Classement inconnu';
  end if;
  return (
    with valeurs as (
      select p.id, p.pseudo, p.elo, prive.valeur_classement(p.id, p_tableau) as valeur,
        (select c.tag from prive.membres_clan m join prive.clans c on c.id = m.clan where m.joueur = p.id) as clan
      from public.profils p where p.pseudo is not null),
    rangs as (select *, rank() over (order by valeur desc) as rang from valeurs)
    select jsonb_build_object(
      'lignes', coalesce((select jsonb_agg(jsonb_build_object('rang', rang, 'pseudo', pseudo, 'valeur', valeur, 'clan', clan,
                  'moi', id = moi) order by rang, lower(pseudo)) from (select * from rangs order by rang, lower(pseudo) limit 100) t), '[]'::jsonb),
      'moi', (select jsonb_build_object('rang', rang, 'valeur', valeur) from rangs where id = moi),
      'joueurs', (select count(*) from valeurs)));
end $$;

create function public.classement_clans() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(c order by (c ->> 'rang')::int, c ->> 'nom'), '[]'::jsonb) from (
    select jsonb_build_object('rang', rank() over (order by prive.score_clan(k.id) desc), 'nom', k.nom, 'tag', k.tag,
      'embleme', k.embleme, 'score', prive.score_clan(k.id),
      'membres', (select count(*) from prive.membres_clan m where m.clan = k.id),
      'moi', exists (select 1 from prive.membres_clan m where m.clan = k.id and m.joueur = auth.uid())) as c
    from prive.clans k order by prive.score_clan(k.id) desc limit 100) l;
$$;

create function public.profil_public(p_pseudo text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  lui uuid := prive.id_du_pseudo(p_pseudo);
  p public.profils;
begin
  select * into p from public.profils where id = lui;
  return jsonb_build_object(
    'pseudo', p.pseudo, 'xp', p.xp, 'elo', p.elo, 'credits', p.credits, 'jcj', p.jcj, 'stats', p.stats,
    'enLigne', prive.en_ligne(p.vu_le), 'vuLe', p.vu_le, 'creeLe', p.cree_le, 'moi', lui = moi,
    'rangElo', (select count(*) + 1 from public.profils q where q.pseudo is not null and q.elo > p.elo),
    'collection', (select count(distinct carte_id) from public.exemplaires where proprietaire = lui),
    'legendaires', prive.valeur_classement(lui, 'legendaires'),
    'vitrine', coalesce((
      select jsonb_agg(jsonb_build_object('carte', v.c,
        'variante', coalesce((select x.variante from public.exemplaires x where x.proprietaire = lui and x.carte_id = v.c
                              order by array_position(array['o5', 'breche', 'arch', 'exp', 'holo', 'std'], x.variante) limit 1), 'std'))
        order by v.n)
      from unnest(p.vitrine) with ordinality v(c, n)
      where exists (select 1 from public.exemplaires x where x.proprietaire = lui and x.carte_id = v.c)), '[]'::jsonb),
    'clan', (select jsonb_build_object('nom', c.nom, 'tag', c.tag, 'role', m.role)
             from prive.membres_clan m join prive.clans c on c.id = m.clan where m.joueur = lui),
    'relation', case
      when lui = moi then null
      when exists (select 1 from prive.blocages where joueur = moi and bloque = lui) then 'bloque'
      when prive.sont_amis(moi, lui) then 'ami'
      when exists (select 1 from prive.amities where de = moi and vers = lui) then 'demande_envoyee'
      when exists (select 1 from prive.amities where de = lui and vers = moi) then 'demande_recue'
      else 'aucune' end,
    'duels', coalesce((
      select jsonb_agg(jsonb_build_object('adversaire', q.pseudo, 'issue',
        case when d.issue = 'nul' then 'nul' when d.gagnant = lui then 'victoire' else 'defaite' end,
        'classe', d.classe, 'le', d.maj_le) order by d.maj_le desc)
      from (select * from public.duels_jcj
            where statut = 'termine' and lui in (joueur_a, joueur_b) order by maj_le desc limit 10) d
      join public.profils q on q.id = case when d.joueur_a = lui then d.joueur_b else d.joueur_a end), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Duels entre joueurs
-- ---------------------------------------------------------------------------
-- État public : vu en direct par les deux joueurs (jamais la bonne réponse ni la main adverse)
create table public.duels_jcj (
  id uuid primary key default gen_random_uuid(),
  joueur_a uuid not null references public.profils on delete cascade,
  joueur_b uuid not null references public.profils on delete cascade,
  -- Classé (file d'attente : Elo et crédits) ou amical (défi entre amis : XP seulement)
  classe boolean not null,
  statut text not null check (statut in ('invitation', 'preparation', 'en_cours', 'termine', 'annule')),
  etat jsonb not null default '{}',
  version int not null default 0,
  issue text check (issue in ('a', 'b', 'nul')),
  gagnant uuid,
  resultat jsonb,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  check (joueur_a <> joueur_b)
);
create index duels_jcj_a on public.duels_jcj (joueur_a, statut);
create index duels_jcj_b on public.duels_jcj (joueur_b, statut);

alter table public.duels_jcj enable row level security;
create policy "ses duels" on public.duels_jcj for select to authenticated using (auth.uid() in (joueur_a, joueur_b));
revoke all on public.duels_jcj from anon, authenticated;
grant select on public.duels_jcj to authenticated;

-- Ce que seul le serveur voit : mains complètes, cartes choisies, bonne réponse, réponses en attente
create table prive.duels_jcj_secret (
  duel uuid primary key references public.duels_jcj on delete cascade,
  etat jsonb not null default '{}'
);

create table prive.file_jcj (
  joueur uuid primary key references public.profils on delete cascade,
  elo int not null,
  entre_le timestamptz not null default now(),
  vu_le timestamptz not null default now()
);

create function prive.equipe_ok(p_joueur uuid) returns boolean
language sql stable as $$
  select cardinality(e) = 5 and (select count(distinct x) from unnest(e) x) = 5 and not exists (
    select 1 from unnest(e) x
    where not exists (select 1 from public.exemplaires y where y.proprietaire = p_joueur and y.carte_id = x))
  from (select equipe as e from public.profils where id = p_joueur) p;
$$;

create function prive.equipe_valide(p_joueur uuid) returns text[]
language plpgsql stable as $$
begin
  if not coalesce(prive.equipe_ok(p_joueur), false) then
    raise exception 'Il faut une équipe de 5 cartes possédées';
  end if;
  return (select equipe from public.profils where id = p_joueur);
end $$;

-- Un duel figé depuis plus de 3 minutes (deux joueurs partis) est annulé, sans gain ni perte
create function prive.nettoyer_jcj() returns void
language plpgsql volatile as $$
begin
  update public.duels_jcj set statut = 'annule', maj_le = now()
   where (statut = 'invitation' and cree_le < now() - interval '1 minute')
      or (statut in ('preparation', 'en_cours') and maj_le < now() - interval '3 minutes');
  delete from prive.file_jcj where vu_le < now() - interval '30 seconds';
end $$;

-- Ce dont la fonction Edge a besoin pour préparer un duel : les deux équipes et la langue des questions
create function prive.preparer_jcj(p_duel uuid) returns jsonb
language plpgsql volatile as $$
declare
  d public.duels_jcj;
begin
  select * into d from public.duels_jcj where id = p_duel for update;
  update public.duels_jcj set statut = 'preparation', maj_le = now() where id = p_duel;
  return jsonb_build_object('id', d.id, 'joueurA', d.joueur_a, 'joueurB', d.joueur_b, 'classe', d.classe,
    'equipeA', to_jsonb(prive.equipe_valide(d.joueur_a)), 'equipeB', to_jsonb(prive.equipe_valide(d.joueur_b)),
    -- Questions en VF seulement si les deux joueurs jouent en VF
    'langue', case when (select bool_and(langue = 'vf') from public.profils where id in (d.joueur_a, d.joueur_b)) then 'vf' else 'vo' end);
end $$;

-- File classée : appariement avec le joueur en attente le plus proche en Elo. La fourchette s'élargit
-- avec l'attente (100 points, +10 par seconde). Renvoie le duel à préparer, celui en cours, ou l'attente.
create function public.jcj_entrer_file(p_joueur uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  p public.profils;
  en_cours public.duels_jcj;
  adversaire prive.file_jcj;
  id_duel uuid;
begin
  perform prive.nettoyer_jcj();
  select * into p from public.profils where id = p_joueur for update;
  if p.pseudo is null then
    raise exception 'Choisissez d''abord un pseudo d''agent';
  end if;
  select * into en_cours from public.duels_jcj
   where p_joueur in (joueur_a, joueur_b) and statut in ('preparation', 'en_cours') order by cree_le desc limit 1;
  if found then
    return jsonb_build_object('enCours', en_cours.id);
  end if;
  perform prive.equipe_valide(p_joueur);
  select f.* into adversaire from prive.file_jcj f
   where f.joueur <> p_joueur and not prive.bloque(f.joueur, p_joueur) and prive.equipe_ok(f.joueur)
     and abs(f.elo - p.elo) <= 100 + 10 * extract(epoch from now() - least(f.entre_le,
       coalesce((select entre_le from prive.file_jcj where joueur = p_joueur), now())))
   order by abs(f.elo - p.elo), f.entre_le
   limit 1 for update skip locked;
  if not found then
    insert into prive.file_jcj (joueur, elo) values (p_joueur, p.elo)
      on conflict (joueur) do update set vu_le = now(), elo = excluded.elo;
    return jsonb_build_object('attente', true,
      'enFile', (select count(*) from prive.file_jcj));
  end if;
  delete from prive.file_jcj where joueur in (p_joueur, adversaire.joueur);
  -- Le premier arrivé est le joueur A
  insert into public.duels_jcj (joueur_a, joueur_b, classe, statut) values (adversaire.joueur, p_joueur, true, 'preparation')
    returning id into id_duel;
  return jsonb_build_object('preparer', prive.preparer_jcj(id_duel));
end $$;

create function public.jcj_quitter_file(p_joueur uuid) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from prive.file_jcj where joueur = p_joueur returning true;
$$;

-- Défi amical, réservé aux amis ; l'invitation expire au bout d'une minute
create function public.jcj_defier(p_joueur uuid, p_pseudo text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  lui uuid := prive.id_du_pseudo(p_pseudo);
  id_duel uuid;
begin
  perform prive.nettoyer_jcj();
  if not prive.sont_amis(p_joueur, lui) or prive.bloque(p_joueur, lui) then
    raise exception 'On ne peut défier que ses amis';
  end if;
  perform prive.equipe_valide(p_joueur);
  if exists (select 1 from public.duels_jcj where statut in ('invitation', 'preparation', 'en_cours')
             and (p_joueur in (joueur_a, joueur_b) or lui in (joueur_a, joueur_b))) then
    raise exception 'L''un de vous deux est déjà en duel';
  end if;
  insert into public.duels_jcj (joueur_a, joueur_b, classe, statut) values (p_joueur, lui, false, 'invitation')
    returning id into id_duel;
  return jsonb_build_object('id', id_duel);
end $$;

create function public.jcj_repondre_defi(p_joueur uuid, p_duel uuid, p_accepter boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  d public.duels_jcj;
begin
  perform prive.nettoyer_jcj();
  select * into d from public.duels_jcj where id = p_duel and joueur_b = p_joueur for update;
  if not found or d.statut <> 'invitation' then
    raise exception 'Ce défi a expiré';
  end if;
  if not p_accepter then
    update public.duels_jcj set statut = 'annule', maj_le = now() where id = p_duel;
    return jsonb_build_object('refuse', true);
  end if;
  return jsonb_build_object('preparer', prive.preparer_jcj(p_duel));
end $$;

-- Reprise d'un duel resté en préparation (la fonction Edge n'a pas pu l'initialiser)
create function public.jcj_preparer(p_duel uuid, p_joueur uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.duels_jcj where id = p_duel and p_joueur in (joueur_a, joueur_b)
                 and statut = 'preparation' and version = 0) then
    raise exception 'Duel introuvable';
  end if;
  return prive.preparer_jcj(p_duel);
end $$;

create function public.jcj_lire(p_duel uuid, p_joueur uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('statut', d.statut, 'classe', d.classe, 'joueurA', d.joueur_a, 'joueurB', d.joueur_b,
    'etat', d.etat, 'secret', s.etat, 'version', d.version, 'resultat', d.resultat,
    'pseudoA', (select pseudo from public.profils where id = d.joueur_a),
    'pseudoB', (select pseudo from public.profils where id = d.joueur_b),
    'eloA', (select elo from public.profils where id = d.joueur_a),
    'eloB', (select elo from public.profils where id = d.joueur_b))
  from public.duels_jcj d left join prive.duels_jcj_secret s on s.duel = d.id
  where d.id = p_duel and p_joueur in (d.joueur_a, d.joueur_b);
$$;

-- Écriture optimiste : refusée si quelqu'un a modifié le duel entre-temps (la fonction Edge relit et recommence)
create function public.jcj_ecrire(p_duel uuid, p_version int, p_etat jsonb, p_secret jsonb) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update public.duels_jcj set etat = p_etat, version = version + 1, statut = 'en_cours', maj_le = now()
   where id = p_duel and version = p_version and statut in ('preparation', 'en_cours');
  if not found then
    return false;
  end if;
  insert into prive.duels_jcj_secret (duel, etat) values (p_duel, p_secret)
    on conflict (duel) do update set etat = excluded.etat;
  return true;
end $$;

-- Fin du duel : Elo (K = 32) et crédits pour un duel classé, XP pour tous. Gains plafonnés à 20 duels classés
-- récompensés par jour, et 3 par jour contre le même adversaire, pour décourager les arrangements.
create function public.jcj_clore(p_duel uuid, p_version int, p_etat jsonb, p_issue text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  d public.duels_jcj;
  pa public.profils;
  pb public.profils;
  score_a numeric;
  attendu_a numeric;
  delta int := 0;
  gains jsonb := '{}'::jsonb;
  cote text;
  joueur uuid;
  adverse uuid;
  score numeric;
  credits_j int;
  xp_j int;
  recompense boolean;
begin
  select * into d from public.duels_jcj where id = p_duel for update;
  if not found or d.version <> p_version or d.statut <> 'en_cours' then
    raise exception 'Duel introuvable ou déjà terminé';
  end if;
  if p_issue not in ('a', 'b', 'nul') then
    raise exception 'Issue invalide';
  end if;
  select * into pa from public.profils where id = d.joueur_a for update;
  select * into pb from public.profils where id = d.joueur_b for update;
  score_a := case p_issue when 'a' then 1 when 'b' then 0 else 0.5 end;
  if d.classe then
    attendu_a := 1 / (1 + power(10, (pb.elo - pa.elo) / 400.0));
    delta := round(32 * (score_a - attendu_a));
  end if;
  foreach cote in array array['a', 'b'] loop
    joueur := case cote when 'a' then d.joueur_a else d.joueur_b end;
    adverse := case cote when 'a' then d.joueur_b else d.joueur_a end;
    score := case cote when 'a' then score_a else 1 - score_a end;
    recompense := d.classe
      and (select count(*) from public.duels_jcj x where x.statut = 'termine' and x.classe and x.maj_le > now() - interval '1 day'
           and joueur in (x.joueur_a, x.joueur_b)
           and (x.resultat -> (case when x.joueur_a = joueur then 'a' else 'b' end) ->> 'credits')::int > 0) < 20
      and (select count(*) from public.duels_jcj x where x.statut = 'termine' and x.classe and x.maj_le > now() - interval '1 day'
           and joueur in (x.joueur_a, x.joueur_b) and adverse in (x.joueur_a, x.joueur_b)) < 3;
    credits_j := case when not recompense then 0 when score = 1 then 120 when score = 0.5 then 50 else 25 end;
    xp_j := case when score = 1 then 60 when score = 0.5 then 30 else 20 end;
    if not d.classe then
      xp_j := 15;
    end if;
    update public.profils set
      elo = greatest(100, elo + case cote when 'a' then delta else -delta end),
      xp = xp + xp_j,
      jcj = jcj || jsonb_build_object(
        'victoires', coalesce((jcj ->> 'victoires')::int, 0) + (score = 1)::int,
        'defaites', coalesce((jcj ->> 'defaites')::int, 0) + (score = 0)::int,
        'nuls', coalesce((jcj ->> 'nuls')::int, 0) + (score = 0.5)::int)
     where id = joueur;
    perform prive.crediter(joueur, credits_j, 'duel_jcj', p_duel::text);
    gains := gains || jsonb_build_object(cote, jsonb_build_object(
      'credits', credits_j, 'xp', xp_j, 'elo', case cote when 'a' then delta else -delta end,
      'profil', prive.profil_json(joueur)));
  end loop;
  update public.duels_jcj set statut = 'termine', etat = p_etat, version = version + 1, issue = p_issue,
    gagnant = case p_issue when 'a' then d.joueur_a when 'b' then d.joueur_b end,
    -- Sans les profils complets : ce résultat est lisible par les deux joueurs
    resultat = jsonb_build_object('a', (gains -> 'a') - 'profil', 'b', (gains -> 'b') - 'profil'), maj_le = now()
   where id = p_duel;
  return gains;
end $$;

-- Tableau de bord des confrontations : Elo, rang, joueurs en ligne, amis à défier, duel en cours, invitations
create function public.tableau_duels() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  p public.profils;
begin
  perform prive.nettoyer_jcj();
  select * into p from public.profils where id = moi;
  return jsonb_build_object(
    'elo', p.elo, 'jcj', p.jcj,
    'rang', (select count(*) + 1 from public.profils q where q.pseudo is not null and q.elo > p.elo),
    'enLigne', (select count(*) from public.profils q where prive.en_ligne(q.vu_le)),
    'enFile', (select count(*) from prive.file_jcj),
    'iaRestants', greatest(0, 10 - (select count(*) from prive.duels_ia
                                    where joueur = moi and fin > now() - interval '1 day' and credits > 0)),
    'jcjRestants', greatest(0, 20 - (select count(*) from public.duels_jcj x where x.statut = 'termine' and x.classe
                                     and x.maj_le > now() - interval '1 day' and moi in (x.joueur_a, x.joueur_b)
                                     and (x.resultat -> (case when x.joueur_a = moi then 'a' else 'b' end) ->> 'credits')::int > 0)),
    'enCours', (select id from public.duels_jcj where moi in (joueur_a, joueur_b) and statut in ('preparation', 'en_cours')
                order by cree_le desc limit 1),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'pseudo', q.pseudo, 'elo', q.elo) order by d.cree_le desc)
      from public.duels_jcj d join public.profils q on q.id = d.joueur_a
      where d.joueur_b = moi and d.statut = 'invitation'), '[]'::jsonb),
    'amisEnLigne', coalesce((
      select jsonb_agg(jsonb_build_object('pseudo', q.pseudo, 'elo', q.elo,
        'occupe', exists (select 1 from public.duels_jcj d where q.id in (d.joueur_a, d.joueur_b)
                          and d.statut in ('invitation', 'preparation', 'en_cours'))) order by q.elo desc)
      from prive.amities a join public.profils q on q.id = case when a.de = moi then a.vers else a.de end
      where a.statut = 'ami' and moi in (a.de, a.vers) and prive.en_ligne(q.vu_le)), '[]'::jsonb));
end $$;

-- Diffusion en direct : l'état des duels et les messages
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.duels_jcj;
    alter publication supabase_realtime add table public.messages;
  end if;
exception when others then
  raise notice 'Direct des duels et messages non activé : %', sqlerrm;
end $$;

-- Nettoyage chaque minute (invitations expirées, duels abandonnés, file d'attente)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('scp-masters-jcj', '* * * * *', 'select prive.nettoyer_jcj()');
  end if;
exception when others then
  raise notice 'Nettoyage des duels non planifié : %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Duels contre l'IA : 10 duels récompensés par jour au lieu de 30
-- ---------------------------------------------------------------------------
create or replace function public.duel_clore(p_duel uuid, p_joueur uuid, p_version int, p_etat jsonb, p_issue text, p_bonnes int, p_questions int)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  d prive.duels_ia;
  a prive.adversaires;
  credits_gagnes int;
  xp_gagne int;
  du_jour int;
begin
  perform 1 from public.profils where id = p_joueur for update;
  select * into d from prive.duels_ia where id = p_duel and joueur = p_joueur for update;
  if not found or d.fin is not null or d.version <> p_version then
    raise exception 'Duel introuvable ou déjà terminé';
  end if;
  if p_issue not in ('victoire', 'defaite', 'nul') or p_questions not between 1 and 5 or p_bonnes not between 0 and p_questions then
    raise exception 'Résultat invalide';
  end if;
  select * into a from prive.adversaires where niveau = d.niveau;

  credits_gagnes := case p_issue when 'victoire' then a.gain + p_bonnes * 5 when 'nul' then round(a.gain / 3.0) else 10 end;
  xp_gagne := case p_issue when 'victoire' then a.xp when 'nul' then round(a.xp / 2.0) else 15 end;
  select count(*) into du_jour from prive.duels_ia
   where joueur = p_joueur and fin > now() - interval '1 day' and credits > 0;
  if du_jour >= 10 then
    credits_gagnes := 0;
    xp_gagne := 0;
  end if;

  update prive.duels_ia set fin = now(), issue = p_issue, bonnes = p_bonnes, credits = credits_gagnes, xp = xp_gagne,
    etat = p_etat, version = version + 1
   where id = p_duel;
  update public.profils set
    credits = credits + credits_gagnes,
    xp = xp + xp_gagne,
    meilleur_adversaire = case when p_issue = 'victoire' then greatest(meilleur_adversaire, d.niveau) else meilleur_adversaire end,
    stats = stats || jsonb_build_object(
      'duels', coalesce((stats ->> 'duels')::int, 0) + 1,
      'victoires', coalesce((stats ->> 'victoires')::int, 0) + case when p_issue = 'victoire' then 1 else 0 end,
      'questions', coalesce((stats ->> 'questions')::int, 0) + p_questions,
      'bonnesReponses', coalesce((stats ->> 'bonnesReponses')::int, 0) + p_bonnes)
  where id = p_joueur;
  if credits_gagnes > 0 then
    insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, credits_gagnes, 'duel', p_duel::text);
  end if;
  return jsonb_build_object('credits', credits_gagnes, 'xp', xp_gagne, 'profil', prive.profil_json(p_joueur));
end $$;

-- ---------------------------------------------------------------------------
-- 8. Suppression du compte : quitter son clan proprement (le clan garde un chef)
-- ---------------------------------------------------------------------------
create or replace function public.supprimer_mon_compte() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.quitter_marche(moi);
  perform prive.quitter_clan(moi);
  delete from auth.users where id = moi;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function
  public.signaler_presence(), public.maj_vitrine(text[]),
  public.demander_ami(text), public.repondre_ami(text, boolean), public.retirer_ami(text), public.bloquer(text),
  public.debloquer(text), public.mes_amis(),
  public.creer_clan(text, text, text, boolean), public.rejoindre_clan(text), public.quitter_clan(), public.gerer_membre(text, text),
  public.modifier_clan(text, boolean, text), public.liste_clans(text), public.fiche_clan(text),
  public.peut_lire_salon(text), public.envoyer_message(text, text, text), public.messages_salon(text, text, bigint),
  public.conversations(), public.signaler_message(bigint, text),
  public.classement(text), public.classement_clans(), public.profil_public(text), public.tableau_duels(),
  public.supprimer_mon_compte(),
  public.jcj_entrer_file(uuid), public.jcj_quitter_file(uuid), public.jcj_defier(uuid, text),
  public.jcj_repondre_defi(uuid, uuid, boolean), public.jcj_preparer(uuid, uuid), public.jcj_lire(uuid, uuid), public.jcj_ecrire(uuid, int, jsonb, jsonb),
  public.jcj_clore(uuid, int, jsonb, text), public.duel_clore(uuid, uuid, int, jsonb, text, int, int)
from public, anon, authenticated;

grant execute on function
  public.signaler_presence(), public.maj_vitrine(text[]),
  public.demander_ami(text), public.repondre_ami(text, boolean), public.retirer_ami(text), public.bloquer(text),
  public.debloquer(text), public.mes_amis(),
  public.creer_clan(text, text, text, boolean), public.rejoindre_clan(text), public.quitter_clan(), public.gerer_membre(text, text),
  public.modifier_clan(text, boolean, text), public.liste_clans(text), public.fiche_clan(text),
  public.peut_lire_salon(text), public.envoyer_message(text, text, text), public.messages_salon(text, text, bigint),
  public.conversations(), public.signaler_message(bigint, text),
  public.classement(text), public.classement_clans(), public.profil_public(text), public.tableau_duels(),
  public.supprimer_mon_compte()
to authenticated;

-- Réservées à la fonction Edge « duel » (clé de service)
grant execute on function
  public.jcj_entrer_file(uuid), public.jcj_quitter_file(uuid), public.jcj_defier(uuid, text),
  public.jcj_repondre_defi(uuid, uuid, boolean), public.jcj_preparer(uuid, uuid), public.jcj_lire(uuid, uuid), public.jcj_ecrire(uuid, int, jsonb, jsonb),
  public.jcj_clore(uuid, int, jsonb, text), public.duel_clore(uuid, uuid, int, jsonb, text, int, int)
to service_role;
