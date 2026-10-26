-- SCP Masters : hôtel des ventes en direct, cours des cartes, échanges entre joueurs et brûlage.
-- Comme le reste du jeu, tout mouvement de cartes ou de crédits passe par une fonction du serveur,
-- dans une seule transaction, avec verrous. Le navigateur demande, le serveur décide.
--
-- Constantes à garder synchronisées avec src/engine/marche.ts : durées, pas d'enchère, frais,
-- valeur de brûlage, limites.

-- ---------------------------------------------------------------------------
-- Outils communs
-- ---------------------------------------------------------------------------

-- Crédits rendus en brûlant un exemplaire : la valeur de recyclage, multipliée par la variante
create function prive.valeur_brulage(p_rarete int, p_variante text) returns int
language sql immutable as $$
  select (array[5, 12, 35, 90, 300])[p_rarete + 1]
    * case p_variante when 'holo' then 3 when 'exp' then 4 when 'arch' then 6 when 'breche' then 12 when 'o5' then 30 else 1 end;
$$;

-- Un exemplaire libre (ni réservé, ni souvenir) de cette carte et variante ; on cède le plus grand numéro de série
create function prive.exemplaire_libre(p_joueur uuid, p_carte text, p_variante text) returns uuid
language sql volatile as $$
  select id from public.exemplaires
  where proprietaire = p_joueur and carte_id = p_carte and variante = p_variante
    and echangeable and bloque_par is null and origine <> 'souvenir'
  order by numero_serie desc nulls last, obtenu_le desc
  limit 1
  for update skip locked;
$$;

-- L'équipe ne garde que les cartes encore possédées
create function prive.nettoyer_equipe(p_joueur uuid) returns void
language sql volatile as $$
  update public.profils p set equipe = coalesce((
    select array_agg(e order by o) from unnest(p.equipe) with ordinality u(e, o)
    where exists (select 1 from public.exemplaires x where x.proprietaire = p_joueur and x.carte_id = e)), '{}')
  where p.id = p_joueur;
$$;

-- Donne un exemplaire à un autre joueur : nouvelle carte signalée, souhait exaucé, équipe de l'ancien propriétaire à jour
create function prive.transferer(p_exemplaire uuid, p_vers uuid, p_origine text) returns void
language plpgsql volatile as $$
declare
  carte text;
  avant uuid;
  possedait boolean;
begin
  select carte_id, proprietaire into carte, avant from public.exemplaires where id = p_exemplaire for update;
  select exists (select 1 from public.exemplaires where proprietaire = p_vers and carte_id = carte) into possedait;
  update public.exemplaires set proprietaire = p_vers, origine = p_origine, bloque_par = null, obtenu_le = now()
   where id = p_exemplaire;
  update public.profils set
    nouvelles = case when possedait or carte = any (nouvelles) then nouvelles else array_append(nouvelles, carte) end,
    souhaits = array_remove(souhaits, carte)
  where id = p_vers;
  perform prive.nettoyer_equipe(avant);
end $$;

create function prive.crediter(p_joueur uuid, p_montant bigint, p_motif text, p_reference text) returns void
language plpgsql volatile as $$
begin
  if p_montant = 0 then
    return;
  end if;
  -- La contrainte credits >= 0 refuse tout débit sans provision
  update public.profils set credits = credits + p_montant where id = p_joueur;
  insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, p_montant, p_motif, p_reference);
end $$;

-- Le marché et les échanges demandent un pseudo : c'est lui que voient les autres joueurs
create function prive.joueur_du_marche() returns uuid
language plpgsql volatile as $$
declare
  moi uuid := prive.joueur();
begin
  if (select pseudo from public.profils where id = moi) is null then
    raise exception 'Choisissez d''abord un pseudo d''agent';
  end if;
  return moi;
end $$;

-- ---------------------------------------------------------------------------
-- Hôtel des ventes
-- ---------------------------------------------------------------------------
create table public.encheres (
  id uuid primary key default gen_random_uuid(),
  exemplaire uuid not null references public.exemplaires on delete cascade,
  vendeur uuid not null references public.profils on delete cascade,
  carte_id text not null references public.cartes,
  variante text not null,
  numero_serie int,
  prix_depart bigint not null check (prix_depart between 1 and 10000000),
  achat_immediat bigint check (achat_immediat is null or (achat_immediat > prix_depart and achat_immediat <= 10000000)),
  -- Meilleure mise : son montant est déjà prélevé sur le solde de l'enchérisseur
  mise bigint,
  encherisseur uuid references public.profils on delete set null,
  nb_mises int not null default 0,
  debut timestamptz not null default now(),
  fin timestamptz not null,
  statut text not null default 'ouverte' check (statut in ('ouverte', 'vendue', 'invendue', 'annulee')),
  close_le timestamptz
);
create index encheres_ouvertes on public.encheres (fin) where statut = 'ouverte';
create index encheres_carte on public.encheres (carte_id, variante);
create index encheres_vendeur on public.encheres (vendeur, statut);
create index encheres_encherisseur on public.encheres (encherisseur, statut);

create table prive.mises (
  id bigserial primary key,
  enchere uuid not null references public.encheres on delete cascade,
  joueur uuid references public.profils on delete set null,
  montant bigint not null,
  le timestamptz not null default now()
);
create index mises_enchere on prive.mises (enchere, le desc);

-- Historique des prix : chaque vente conclue, pour le cours des cartes
create table public.ventes (
  id bigserial primary key,
  carte_id text not null,
  variante text not null,
  prix bigint not null,
  achat_immediat boolean not null default false,
  le timestamptz not null default now()
);
create index ventes_carte on public.ventes (carte_id, variante, le desc);

-- Conclut une enchère : l'exemplaire part au meilleur enchérisseur, le vendeur touche la mise moins 5 % de frais
create function prive.regler_enchere(p_enchere uuid, p_achat_immediat boolean) returns void
language plpgsql volatile as $$
declare
  e public.encheres;
  frais bigint;
begin
  select * into e from public.encheres where id = p_enchere and statut = 'ouverte' for update;
  if not found then
    return;
  end if;
  if e.mise is null or e.encherisseur is null then
    update public.exemplaires set bloque_par = null where id = e.exemplaire;
    update public.encheres set statut = 'invendue', close_le = now() where id = e.id;
    return;
  end if;
  frais := ceil(e.mise * 0.05);
  perform prive.transferer(e.exemplaire, e.encherisseur, 'enchere');
  perform prive.crediter(e.vendeur, e.mise - frais, 'vente', e.id::text);
  insert into public.ventes (carte_id, variante, prix, achat_immediat) values (e.carte_id, e.variante, e.mise, p_achat_immediat);
  update public.encheres set statut = 'vendue', close_le = now(), fin = least(fin, now()) where id = e.id;
end $$;

-- Échéances : enchères terminées et offres d'échange expirées. Lancé chaque minute par pg_cron,
-- et au début des fonctions du marché pour ne jamais montrer une échéance dépassée.
create function prive.clore_echeances() returns void
language plpgsql volatile as $$
declare
  id_echu uuid;
begin
  for id_echu in select id from public.encheres where statut = 'ouverte' and fin <= now() order by fin limit 200 for update skip locked loop
    perform prive.regler_enchere(id_echu, false);
  end loop;
  for id_echu in select id from public.offres where statut = 'ouverte' and expire_le <= now() limit 200 for update skip locked loop
    perform prive.clore_offre(id_echu, 'expiree');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Échanges entre joueurs
-- ---------------------------------------------------------------------------
create table public.offres (
  id uuid primary key default gen_random_uuid(),
  de uuid not null references public.profils on delete cascade,
  a uuid not null references public.profils on delete cascade,
  -- Crédits proposés : prélevés à la création, rendus si l'offre n'aboutit pas
  credits_de bigint not null default 0 check (credits_de between 0 and 10000000),
  credits_a bigint not null default 0 check (credits_a between 0 and 10000000),
  message text check (length(message) <= 200),
  statut text not null default 'ouverte' check (statut in ('ouverte', 'acceptee', 'refusee', 'annulee', 'expiree')),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '7 days',
  close_le timestamptz,
  check (de <> a)
);
create index offres_de on public.offres (de, statut);
create index offres_a on public.offres (a, statut);

create table public.offres_lignes (
  id bigserial primary key,
  offre uuid not null references public.offres on delete cascade,
  -- de : ce que propose l'auteur (exemplaire réservé dès la création) ; a : ce qu'il demande (choisi à l'acceptation)
  cote text not null check (cote in ('de', 'a')),
  carte_id text not null references public.cartes,
  variante text not null check (variante in ('std', 'holo', 'exp', 'arch', 'breche', 'o5')),
  exemplaire uuid references public.exemplaires on delete set null,
  numero_serie int
);
create index offres_lignes_offre on public.offres_lignes (offre);

-- Met fin à une offre sans échange : cartes libérées, crédits rendus à l'auteur
create function prive.clore_offre(p_offre uuid, p_statut text) returns void
language plpgsql volatile as $$
declare
  o public.offres;
begin
  select * into o from public.offres where id = p_offre and statut = 'ouverte' for update;
  if not found then
    return;
  end if;
  update public.exemplaires set bloque_par = null where bloque_par = o.id;
  perform prive.crediter(o.de, o.credits_de, 'echange_rendu', o.id::text);
  update public.offres set statut = p_statut, close_le = now() where id = o.id;
end $$;

-- ---------------------------------------------------------------------------
-- Droits : lecture seule, et seulement ce qui doit l'être
-- ---------------------------------------------------------------------------
alter table public.encheres enable row level security;
alter table public.ventes enable row level security;
alter table public.offres enable row level security;
alter table public.offres_lignes enable row level security;

-- Les enchères et les prix sont publics pour les joueurs connectés (le direct passe par Realtime)
create policy "encheres visibles" on public.encheres for select to authenticated using (true);
create policy "cours visibles" on public.ventes for select to authenticated using (true);
create policy "ses offres" on public.offres for select to authenticated using (de = auth.uid() or a = auth.uid());
create policy "lignes de ses offres" on public.offres_lignes for select to authenticated
  using (exists (select 1 from public.offres o where o.id = offre and (o.de = auth.uid() or o.a = auth.uid())));

revoke all on public.encheres, public.ventes, public.offres, public.offres_lignes from anon, authenticated;
grant select on public.encheres, public.ventes, public.offres, public.offres_lignes to authenticated;

-- Le direct : chaque mise, vente ou nouvelle enchère est diffusée aux navigateurs abonnés
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.encheres;
  end if;
exception when others then
  -- Déjà diffusée, ou droits insuffisants : le marché se recharge aussi toutes les 30 secondes
  raise notice 'Direct des enchères non activé : %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le jeu : hôtel des ventes
-- ---------------------------------------------------------------------------

-- Enchères en cours et historique personnel
create function public.marche() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.clore_echeances();
  return jsonb_build_object(
    'maintenant', now(),
    'ouvertes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'carte', e.carte_id, 'variante', e.variante, 'serie', e.numero_serie,
        'prixDepart', e.prix_depart, 'achatImmediat', e.achat_immediat, 'mise', e.mise, 'nbMises', e.nb_mises,
        'fin', e.fin, 'vendeur', v.pseudo, 'aMoi', e.vendeur = moi, 'enTete', e.encherisseur = moi) order by e.fin)
      from public.encheres e join public.profils v on v.id = e.vendeur
      where e.statut = 'ouverte'), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(h order by h ->> 'close' desc) from (
        select jsonb_build_object(
          'id', e.id, 'carte', e.carte_id, 'variante', e.variante, 'serie', e.numero_serie, 'statut', e.statut,
          'mise', e.mise, 'close', e.close_le, 'vendu', e.vendeur = moi) as h
        from public.encheres e
        where e.statut <> 'ouverte' and (e.vendeur = moi or (e.encherisseur = moi and e.statut = 'vendue'))
        order by e.close_le desc limit 30) d), '[]'::jsonb));
end $$;

-- Met un exemplaire aux enchères : il est réservé jusqu'à la fin de la vente
create function public.mettre_aux_encheres(p_carte text, p_variante text, p_prix bigint, p_duree_minutes int, p_achat_immediat bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  ex uuid;
  id_enchere uuid := gen_random_uuid();
begin
  perform 1 from public.profils where id = moi for update;
  if p_duree_minutes is null or p_duree_minutes not in (15, 60, 360, 1440, 4320, 10080) then
    raise exception 'Durée invalide';
  end if;
  if p_prix is null or p_prix not between 1 and 10000000 then
    raise exception 'Prix de départ invalide';
  end if;
  if p_achat_immediat is not null and (p_achat_immediat <= p_prix or p_achat_immediat > 10000000) then
    raise exception 'Le prix d''achat immédiat doit dépasser la mise de départ';
  end if;
  if (select count(*) from public.encheres where vendeur = moi and statut = 'ouverte') >= 20 then
    raise exception 'Vingt ventes en cours au maximum';
  end if;
  ex := prive.exemplaire_libre(moi, p_carte, p_variante);
  if ex is null then
    raise exception 'Aucun exemplaire libre de cette carte dans cette variante';
  end if;
  insert into public.encheres (id, exemplaire, vendeur, carte_id, variante, numero_serie, prix_depart, achat_immediat, fin)
    select id_enchere, ex, moi, x.carte_id, x.variante, x.numero_serie, p_prix, p_achat_immediat, now() + make_interval(mins => p_duree_minutes)
    from public.exemplaires x where x.id = ex;
  update public.exemplaires set bloque_par = id_enchere where id = ex;
  return jsonb_build_object('id', id_enchere);
end $$;

-- Mise : prélevée tout de suite, rendue au précédent meilleur enchérisseur. Une mise au prix d'achat immédiat conclut la vente.
create function public.encherir(p_enchere uuid, p_montant bigint) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  e public.encheres;
  minimum bigint;
  montant bigint := p_montant;
  immediat boolean := false;
begin
  perform prive.clore_echeances();
  select * into e from public.encheres where id = p_enchere for update;
  if not found or e.statut <> 'ouverte' or e.fin <= now() then
    raise exception 'Cette vente est terminée';
  end if;
  if e.vendeur = moi then
    raise exception 'Impossible d''enchérir sur sa propre vente';
  end if;
  if e.encherisseur = moi then
    raise exception 'Vous êtes déjà le meilleur enchérisseur';
  end if;
  minimum := case when e.mise is null then e.prix_depart else e.mise + greatest(1, ceil(e.mise * 0.05))::bigint end;
  if e.achat_immediat is not null and montant >= e.achat_immediat then
    montant := e.achat_immediat;
    immediat := true;
  end if;
  if montant is null or montant < minimum and not immediat then
    raise exception 'Mise minimale : % ₵', minimum;
  end if;
  -- Verrous dans un ordre fixe : deux mises croisées ne s'attendent pas l'une l'autre
  perform 1 from public.profils where id in (moi, e.encherisseur) order by id for update;
  if (select credits from public.profils where id = moi) < montant then
    raise exception 'Crédits insuffisants';
  end if;
  perform prive.crediter(moi, -montant, 'mise', e.id::text);
  if e.encherisseur is not null then
    perform prive.crediter(e.encherisseur, e.mise, 'mise_rendue', e.id::text);
  end if;
  insert into prive.mises (enchere, joueur, montant) values (e.id, moi, montant);
  update public.encheres set
    mise = montant,
    encherisseur = moi,
    nb_mises = nb_mises + 1,
    -- Une mise dans les deux dernières minutes laisse deux minutes aux autres pour répondre
    fin = greatest(fin, now() + interval '2 minutes')
  where id = e.id;
  if immediat then
    perform prive.regler_enchere(e.id, true);
  end if;
  return jsonb_build_object('mise', montant, 'immediat', immediat, 'profil', prive.profil_json(moi));
end $$;

-- Retirer une vente : seulement tant que personne n'a misé
create function public.annuler_enchere(p_enchere uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  e public.encheres;
begin
  select * into e from public.encheres where id = p_enchere and vendeur = moi for update;
  if not found or e.statut <> 'ouverte' then
    raise exception 'Vente introuvable ou terminée';
  end if;
  if e.mise is not null then
    raise exception 'Impossible de retirer une vente qui a déjà reçu une mise';
  end if;
  update public.exemplaires set bloque_par = null where id = e.exemplaire;
  update public.encheres set statut = 'annulee', close_le = now() where id = e.id;
  return true;
end $$;

-- Cours d'une carte, par variante : dernier prix, médiane sur 7 jours, extrêmes et volume sur 30 jours, courbe
create function public.cours_carte(p_carte text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  rarete int;
begin
  perform prive.clore_echeances();
  select ra into rarete from public.cartes where id = p_carte;
  if rarete is null then
    raise exception 'Carte inconnue';
  end if;
  return jsonb_build_object(
    'variantes', (
      select jsonb_object_agg(v, jsonb_build_object(
        'brulage', prive.valeur_brulage(rarete, v),
        'dernier', (select prix from public.ventes where carte_id = p_carte and variante = v order by le desc limit 1),
        'mediane7', (select percentile_disc(0.5) within group (order by prix) from public.ventes
                     where carte_id = p_carte and variante = v and le > now() - interval '7 days'),
        'min30', (select min(prix) from public.ventes where carte_id = p_carte and variante = v and le > now() - interval '30 days'),
        'max30', (select max(prix) from public.ventes where carte_id = p_carte and variante = v and le > now() - interval '30 days'),
        'volume30', (select count(*) from public.ventes where carte_id = p_carte and variante = v and le > now() - interval '30 days'),
        'points', coalesce((select jsonb_agg(jsonb_build_array(le, prix) order by le) from (
                    select le, prix from public.ventes where carte_id = p_carte and variante = v order by le desc limit 60) p), '[]'::jsonb),
        'enVente', (select count(*) from public.encheres where carte_id = p_carte and variante = v and statut = 'ouverte'),
        'libres', (select count(*) from public.exemplaires where proprietaire = moi and carte_id = p_carte and variante = v
                    and echangeable and bloque_par is null and origine <> 'souvenir'),
        'reserves', (select count(*) from public.exemplaires where proprietaire = moi and carte_id = p_carte and variante = v
                    and bloque_par is not null)))
      from unnest(array['std', 'holo', 'exp', 'arch', 'breche', 'o5']) v));
end $$;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le jeu : brûler un dossier
-- ---------------------------------------------------------------------------
create function public.bruler(p_carte text, p_variante text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  ex uuid;
  gain int;
begin
  perform 1 from public.profils where id = moi for update;
  ex := prive.exemplaire_libre(moi, p_carte, p_variante);
  if ex is null then
    raise exception 'Aucun exemplaire libre à brûler (les souvenirs et les cartes en vente ou en échange ne se brûlent pas)';
  end if;
  select prive.valeur_brulage(c.ra, p_variante) into gain from public.cartes c where c.id = p_carte;
  delete from public.exemplaires where id = ex;
  perform prive.crediter(moi, gain, 'brulage', p_carte || ':' || p_variante);
  perform prive.nettoyer_equipe(moi);
  return jsonb_build_object('gain', gain, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le jeu : échanges
-- ---------------------------------------------------------------------------

-- Joueurs dont le pseudo commence par ce texte, pour choisir avec qui échanger
create function public.chercher_joueurs(p_texte text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(pseudo order by pseudo), '[]'::jsonb) from (
    select pseudo from public.profils
    where pseudo is not null and id <> auth.uid() and length(trim(p_texte)) >= 2
      and lower(pseudo) like lower(replace(replace(replace(trim(p_texte), '\', '\\'), '%', '\%'), '_', '\_')) || '%'
    order by pseudo limit 10) j;
$$;

-- Ce qu'un joueur peut échanger : cartes libres, par variante
create function public.collection_echangeable(p_pseudo text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cible uuid;
begin
  perform prive.joueur();
  select id into cible from public.profils where pseudo = p_pseudo;
  if cible is null then
    raise exception 'Agent introuvable';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('c', carte_id, 'v', variante, 'n', n) order by carte_id, variante)
    from (select carte_id, variante, count(*) as n from public.exemplaires
          where proprietaire = cible and echangeable and bloque_par is null and origine <> 'souvenir'
          group by carte_id, variante) x), '[]'::jsonb);
end $$;

-- Proposer un échange : p_donne et p_demande sont des listes [{"c": "scp-173", "v": "std"}]
create function public.proposer_echange(p_pseudo text, p_donne jsonb, p_demande jsonb, p_credits_donnes bigint, p_credits_demandes bigint, p_message text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  cible uuid;
  id_offre uuid := gen_random_uuid();
  ligne record;
  ex uuid;
  donnes int;
  demandes int;
begin
  select id into cible from public.profils where pseudo = p_pseudo;
  if cible is null then
    raise exception 'Agent introuvable';
  end if;
  if cible = moi then
    raise exception 'Impossible d''échanger avec soi-même';
  end if;
  if jsonb_typeof(coalesce(p_donne, '[]')) <> 'array' or jsonb_typeof(coalesce(p_demande, '[]')) <> 'array' then
    raise exception 'Offre invalide';
  end if;
  donnes := jsonb_array_length(coalesce(p_donne, '[]'));
  demandes := jsonb_array_length(coalesce(p_demande, '[]'));
  if donnes > 10 or demandes > 10 then
    raise exception 'Dix cartes au plus de chaque côté';
  end if;
  if coalesce(p_credits_donnes, 0) not between 0 and 10000000 or coalesce(p_credits_demandes, 0) not between 0 and 10000000 then
    raise exception 'Montant invalide';
  end if;
  -- Un échange va dans les deux sens : rien ne se donne sans contrepartie
  if (donnes = 0 and coalesce(p_credits_donnes, 0) = 0) or (demandes = 0 and coalesce(p_credits_demandes, 0) = 0) then
    raise exception 'Chaque côté de l''échange doit contenir au moins une carte ou des crédits';
  end if;
  perform 1 from public.profils where id = moi for update;
  if (select count(*) from public.offres where de = moi and statut = 'ouverte') >= 10 then
    raise exception 'Dix offres en attente au maximum';
  end if;

  insert into public.offres (id, de, a, credits_de, credits_a, message)
    values (id_offre, moi, cible, coalesce(p_credits_donnes, 0), coalesce(p_credits_demandes, 0), nullif(trim(p_message), ''));
  -- Les crédits proposés sont mis de côté jusqu'à la réponse
  if coalesce(p_credits_donnes, 0) > 0 then
    if (select credits from public.profils where id = moi) < p_credits_donnes then
      raise exception 'Crédits insuffisants';
    end if;
    perform prive.crediter(moi, -p_credits_donnes, 'echange_reserve', id_offre::text);
  end if;
  for ligne in select x ->> 'c' as c, coalesce(x ->> 'v', 'std') as v from jsonb_array_elements(coalesce(p_donne, '[]')) x loop
    ex := prive.exemplaire_libre(moi, ligne.c, ligne.v);
    if ex is null then
      raise exception 'Vous n''avez pas d''exemplaire libre de % (%)', ligne.c, ligne.v;
    end if;
    update public.exemplaires set bloque_par = id_offre where id = ex;
    insert into public.offres_lignes (offre, cote, carte_id, variante, exemplaire, numero_serie)
      select id_offre, 'de', carte_id, variante, id, numero_serie from public.exemplaires where id = ex;
  end loop;
  for ligne in select x ->> 'c' as c, coalesce(x ->> 'v', 'std') as v from jsonb_array_elements(coalesce(p_demande, '[]')) x loop
    if not exists (select 1 from public.cartes where id = ligne.c) or ligne.v not in ('std', 'holo', 'exp', 'arch', 'breche', 'o5') then
      raise exception 'Carte demandée invalide';
    end if;
    insert into public.offres_lignes (offre, cote, carte_id, variante) values (id_offre, 'a', ligne.c, ligne.v);
  end loop;
  -- Le destinataire doit avoir de quoi répondre, au moment de l'offre
  if exists (
    select 1 from (select carte_id, variante, count(*) as n from public.offres_lignes where offre = id_offre and cote = 'a' group by 1, 2) d
    where n > (select count(*) from public.exemplaires x where x.proprietaire = cible and x.carte_id = d.carte_id
               and x.variante = d.variante and x.echangeable and x.bloque_par is null and x.origine <> 'souvenir')) then
    raise exception '% n''a pas ces cartes en exemplaires libres', p_pseudo;
  end if;
  return jsonb_build_object('id', id_offre, 'profil', prive.profil_json(moi));
end $$;

-- Accepter ou refuser une offre reçue. Accepter échange tout d'un coup, ou rien.
create function public.repondre_echange(p_offre uuid, p_accepter boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur_du_marche();
  o public.offres;
  ligne record;
  ex uuid;
begin
  perform prive.clore_echeances();
  select * into o from public.offres where id = p_offre and a = moi for update;
  if not found or o.statut <> 'ouverte' then
    raise exception 'Offre introuvable, expirée ou déjà traitée';
  end if;
  if not p_accepter then
    perform prive.clore_offre(o.id, 'refusee');
    return jsonb_build_object('accepte', false, 'profil', prive.profil_json(moi));
  end if;

  perform 1 from public.profils where id in (o.de, o.a) order by id for update;
  if (select credits from public.profils where id = moi) < o.credits_a then
    raise exception 'Crédits insuffisants pour cet échange';
  end if;
  -- Ce que je donne : un exemplaire libre par ligne demandée
  for ligne in select id, carte_id, variante from public.offres_lignes where offre = o.id and cote = 'a' loop
    ex := prive.exemplaire_libre(moi, ligne.carte_id, ligne.variante);
    if ex is null then
      raise exception 'Vous n''avez plus d''exemplaire libre de % (%)', ligne.carte_id, ligne.variante;
    end if;
    update public.exemplaires set bloque_par = o.id where id = ex;
    update public.offres_lignes set exemplaire = ex, numero_serie = (select numero_serie from public.exemplaires where id = ex)
     where id = ligne.id;
  end loop;
  -- Ce que je reçois : les exemplaires réservés par l'auteur depuis l'offre
  for ex in select exemplaire from public.offres_lignes where offre = o.id and cote = 'de' loop
    if ex is null or not exists (select 1 from public.exemplaires where id = ex and proprietaire = o.de and bloque_par = o.id) then
      raise exception 'Cette offre n''est plus valable';
    end if;
  end loop;
  for ex in select exemplaire from public.offres_lignes where offre = o.id and cote = 'de' loop
    perform prive.transferer(ex, moi, 'echange');
  end loop;
  for ex in select exemplaire from public.offres_lignes where offre = o.id and cote = 'a' loop
    perform prive.transferer(ex, o.de, 'echange');
  end loop;
  perform prive.crediter(moi, o.credits_de, 'echange', o.id::text);
  perform prive.crediter(moi, -o.credits_a, 'echange', o.id::text);
  perform prive.crediter(o.de, o.credits_a, 'echange', o.id::text);
  update public.offres set statut = 'acceptee', close_le = now() where id = o.id;
  return jsonb_build_object('accepte', true, 'profil', prive.profil_json(moi));
end $$;

-- Retirer une offre qu'on a faite : cartes libérées, crédits rendus
create function public.annuler_echange(p_offre uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform 1 from public.profils where id = moi for update;
  if not exists (select 1 from public.offres where id = p_offre and de = moi and statut = 'ouverte') then
    raise exception 'Offre introuvable ou déjà traitée';
  end if;
  perform prive.clore_offre(p_offre, 'annulee');
  return jsonb_build_object('profil', prive.profil_json(moi));
end $$;

-- Offres envoyées et reçues, avec leur contenu
create function public.mes_echanges() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.clore_echeances();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'recue', o.a = moi, 'avec', case when o.a = moi then pde.pseudo else pa.pseudo end,
      'statut', o.statut, 'creditsDe', o.credits_de, 'creditsA', o.credits_a, 'message', o.message,
      'cree', o.cree_le, 'expire', o.expire_le, 'close', o.close_le,
      'donne', coalesce((select jsonb_agg(jsonb_build_object('c', l.carte_id, 'v', l.variante, 's', l.numero_serie) order by l.id)
                         from public.offres_lignes l where l.offre = o.id and l.cote = 'de'), '[]'::jsonb),
      'demande', coalesce((select jsonb_agg(jsonb_build_object('c', l.carte_id, 'v', l.variante, 's', l.numero_serie) order by l.id)
                           from public.offres_lignes l where l.offre = o.id and l.cote = 'a'), '[]'::jsonb))
      order by (o.statut = 'ouverte') desc, o.cree_le desc)
    from public.offres o
    join public.profils pde on pde.id = o.de
    join public.profils pa on pa.id = o.a
    where (o.de = moi or o.a = moi) and (o.statut = 'ouverte' or o.close_le > now() - interval '30 days')), '[]'::jsonb);
end $$;

-- Recyclage : un exemplaire en vente ou en échange ne compte plus comme « gardé », il peut partir
create or replace function prive.recycler(p_joueur uuid, p_carte text) returns int
language plpgsql volatile as $$
declare
  libres int;
  recyclables int;
  a_recycler int;
  rarete int;
  gain int;
begin
  select count(*) filter (where bloque_par is null),
         count(*) filter (where variante = 'std' and origine <> 'souvenir' and bloque_par is null)
    into libres, recyclables
    from public.exemplaires where proprietaire = p_joueur and carte_id = p_carte;
  a_recycler := case when libres - recyclables >= 1 then recyclables else greatest(recyclables - 1, 0) end;
  if a_recycler = 0 then
    return 0;
  end if;
  select ra into rarete from public.cartes where id = p_carte;
  gain := a_recycler * (array[5, 12, 35, 90, 300])[rarete + 1];
  delete from public.exemplaires where id in (
    select id from public.exemplaires
    where proprietaire = p_joueur and carte_id = p_carte and variante = 'std' and origine <> 'souvenir' and bloque_par is null
    order by numero_serie desc nulls first
    limit a_recycler);
  update public.profils set credits = credits + gain where id = p_joueur;
  insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, gain, 'recyclage', p_carte);
  return gain;
end $$;

-- ---------------------------------------------------------------------------
-- État du joueur : les exemplaires réservés (vente, échange) sont signalés
-- ---------------------------------------------------------------------------
create or replace function public.mon_etat() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.crediter_boosters(moi);
  perform prive.clore_echeances();
  return jsonb_build_object(
    'profil', prive.profil_json(moi),
    'offresRecues', (select count(*) from public.offres where a = moi and statut = 'ouverte'),
    'collection', coalesce((
      select jsonb_agg(jsonb_build_object('c', carte_id, 'v', variante, 'n', n, 's', souvenirs, 'b', reserves))
      from (
        select carte_id, variante, count(*) as n, count(*) filter (where origine = 'souvenir') as souvenirs,
               count(*) filter (where bloque_par is not null) as reserves
        from public.exemplaires where proprietaire = moi
        group by carte_id, variante
      ) regroupes), '[]'::jsonb));
end $$;

-- Supprimer son compte : ses ventes et offres sont d'abord soldées, pour ne léser personne
create function prive.quitter_marche(p_joueur uuid) returns void
language plpgsql volatile as $$
declare
  id_ligne uuid;
  e public.encheres;
begin
  -- Ses ventes : les mises reçues sont rendues
  for e in select * from public.encheres where vendeur = p_joueur and statut = 'ouverte' for update loop
    if e.encherisseur is not null then
      perform prive.crediter(e.encherisseur, e.mise, 'mise_rendue', e.id::text);
    end if;
    update public.encheres set statut = 'annulee', close_le = now() where id = e.id;
  end loop;
  -- Ses mises en tête : la vente continue, repartie de zéro
  update public.encheres set mise = null, encherisseur = null where encherisseur = p_joueur and statut = 'ouverte';
  -- Les offres qu'on lui a faites : l'auteur récupère ses cartes et ses crédits
  for id_ligne in select id from public.offres where a = p_joueur and statut = 'ouverte' loop
    perform prive.clore_offre(id_ligne, 'refusee');
  end loop;
end $$;

create or replace function public.supprimer_mon_compte() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.quitter_marche(moi);
  delete from auth.users where id = moi;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Échéances chaque minute, si pg_cron est disponible (il l'est sur Supabase)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('scp-masters-echeances', '* * * * *', 'select prive.clore_echeances()');
  end if;
exception when others then
  -- Sans pg_cron, les échéances se règlent quand même à chaque ouverture du marché ou de l'état du joueur
  raise notice 'Planification des échéances non activée : %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution : uniquement les joueurs connectés, uniquement ces fonctions
-- ---------------------------------------------------------------------------
revoke execute on function
  public.marche(), public.mettre_aux_encheres(text, text, bigint, int, bigint), public.encherir(uuid, bigint),
  public.annuler_enchere(uuid), public.cours_carte(text), public.bruler(text, text), public.chercher_joueurs(text),
  public.collection_echangeable(text), public.proposer_echange(text, jsonb, jsonb, bigint, bigint, text),
  public.repondre_echange(uuid, boolean), public.annuler_echange(uuid), public.mes_echanges(),
  public.mon_etat(), public.supprimer_mon_compte()
from public, anon;
grant execute on function
  public.marche(), public.mettre_aux_encheres(text, text, bigint, int, bigint), public.encherir(uuid, bigint),
  public.annuler_enchere(uuid), public.cours_carte(text), public.bruler(text, text), public.chercher_joueurs(text),
  public.collection_echangeable(text), public.proposer_echange(text, jsonb, jsonb, bigint, bigint, text),
  public.repondre_echange(uuid, boolean), public.annuler_echange(uuid), public.mes_echanges(),
  public.mon_etat(), public.supprimer_mon_compte()
to authenticated;
