-- SCP Masters : réglages de rareté, codes, contrats de l'Intendance, succès, cosmétiques du créateur.
--  1. Les communes et peu communes sortent deux fois moins souvent en variante (rare et au-dessus : inchangé).
--  2. Un dossier gratuit toutes les 15 minutes (au lieu de 10), toujours 10 en réserve au plus.
--  3. Les crédits d'un échange sont taxés à 10 %, comme une vente aux enchères (sinon l'échange contournait la taxe).
--  4. Codes à saisir (comme dans d'autres jeux) : créés à la main dans prive.codes, voir supabase/codes.sql.
--  5. Contrats de l'Intendance : chaque semaine, 3 fiches précises rachetées contre un dossier Keter chacune.
--  6. Succès : une page entière, dont les archives complètes par type de fiche ; certains rapportent un titre ou un cadre.
--  7. Cosmétiques du créateur : titre et cadre réservés, pseudo animé (public.createurs).
-- À exécuter dans le SQL Editor de Supabase, après 20261116090000_push_premier_plan.sql.

-- ---------------------------------------------------------------------------
-- 1. Variantes : deux fois moins sur les communes et peu communes
-- ---------------------------------------------------------------------------
create or replace function public.ouvrir_booster(p_type text, p_depuis_stock boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  t prive.types_boosters;
  p public.profils;
  i int;
  rarete int;
  carte text;
  variante text;
  numero int;
  mythique_numerotee boolean;
  essai int;
  deja text[] := '{}';
  tirage jsonb := '[]'::jsonb;
  possedees text[];
begin
  select * into t from prive.types_boosters where id = p_type;
  if not found then
    raise exception 'Booster inconnu : %', p_type;
  end if;
  -- Depuis le stock : le dossier gratuit, ou un dossier Keter offert (Rapport quotidien, piste d'accréditation)
  if p_depuis_stock and not t.depuis_stock and p_type <> 'keter' then
    raise exception 'Ce booster ne s''obtient pas gratuitement';
  end if;

  perform prive.crediter_boosters(moi);
  select * into p from public.profils where id = moi for update;
  if p_depuis_stock and p_type = 'keter' and p.keter_offerts <= 0 then
    raise exception 'Aucun dossier Keter offert';
  end if;
  if p_depuis_stock and p_type <> 'keter' and p.boosters <= 0 then
    raise exception 'Aucun dossier en stock';
  end if;
  if not p_depuis_stock and p.credits < t.prix then
    raise exception 'Crédits insuffisants';
  end if;
  -- Les dossiers Keter et O5 s'achètent en nombre limité par jour (heure de Paris)
  if not p_depuis_stock and t.par_jour is not null and prive.achats_du_jour(moi, p_type) >= t.par_jour then
    raise exception 'Limite du jour atteinte pour ce dossier (% par jour) : de nouveaux achats seront possibles à minuit', t.par_jour;
  end if;
  if not p_depuis_stock and t.par_semaine is not null and prive.achats_de_la_semaine(moi, p_type) >= t.par_semaine then
    raise exception 'Limite de la semaine atteinte pour ce dossier (% par semaine) : de nouveaux achats seront possibles lundi', t.par_semaine;
  end if;

  select coalesce(array_agg(distinct carte_id), '{}') into possedees from public.exemplaires where proprietaire = moi;

  for i in 1 .. 5 loop
    carte := null;
    mythique_numerotee := false;
    rarete := null;
    -- Une Mythique, très rarement : numérotée, en édition limitée (le numéro est commun à toutes ses variantes). Toutes celles
    -- encore disponibles épuisées : une Légendaire à la place
    if random() < t.mythique then
      select c.id into carte from public.cartes c
       where c.ra = 5 and not c.id = any (deja)
         and coalesce((select s.dernier from prive.compteurs_serie s where s.carte_id = c.id and s.variante = 'std'), 0) < prive.edition_mythique()
       order by random() limit 1;
      if carte is not null then
        numero := prive.numero_mythique(carte);
        if numero is null then
          -- Le dernier exemplaire vient de partir dans un autre dossier
          carte := null;
        else
          mythique_numerotee := true;
          -- Une Mythique peut sortir dans une variante : les siennes (Négatif, Épreuve d'artiste) ou les autres
          variante := prive.tirer_variante_mythique(t.bonus_variante);
        end if;
      end if;
      if carte is null then
        rarete := 4;
      end if;
    end if;
    if carte is null then
      rarete := coalesce(rarete, prive.tirer_indice(case when i = 5 then t.poids_derniere else t.poids end));
      carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
      -- Évite deux fois la même carte dans un même dossier
      essai := 0;
      while carte = any (deja) and essai < 5 loop
        carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
        essai := essai + 1;
      end loop;
      -- Les communes et peu communes sortent deux fois moins souvent en variante : une variante reste un événement
      variante := prive.tirer_variante(t.bonus_variante * case when rarete <= 1 then 0.5 else 1 end);
    end if;
    deja := deja || carte;
    if not mythique_numerotee then
      numero := prive.prochain_numero(carte, variante);
    end if;
    insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine)
      values (moi, carte, variante, numero, 'booster');
    tirage := tirage || jsonb_build_object('id', carte, 'v', variante, 'n', numero);
  end loop;

  update public.profils set
    boosters = case when p_depuis_stock and p_type <> 'keter' then boosters - 1 else boosters end,
    keter_offerts = case when p_depuis_stock and p_type = 'keter' then keter_offerts - 1 else keter_offerts end,
    credits = case when p_depuis_stock then credits else credits - t.prix end,
    xp = xp + 5,
    stats = jsonb_set(stats, '{boostersOuverts}', to_jsonb(coalesce((stats ->> 'boostersOuverts')::int, 0) + 1)),
    nouvelles = (select coalesce(array_agg(distinct n), '{}') from unnest(nouvelles || array(
      select x from unnest(deja) x where not x = any (possedees))) n),
    souhaits = (select coalesce(array_agg(s), '{}') from unnest(souhaits) s where not s = any (deja))
  where id = moi;

  if not p_depuis_stock then
    insert into public.mouvements_credits (joueur, montant, motif, reference) values (moi, -t.prix, 'booster', p_type);
  end if;
  insert into prive.tirages (joueur, type_booster, cartes) values (moi, p_type, tirage);

  return jsonb_build_object('cartes', tirage, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 2. Un dossier gratuit toutes les 15 minutes
-- ---------------------------------------------------------------------------
create or replace function prive.crediter_boosters(p_joueur uuid) returns void
language plpgsql volatile as $$
declare
  p public.profils;
  gagnes int;
  total int;
begin
  select * into p from public.profils where id = p_joueur for update;
  if p.boosters >= 10 then
    update public.profils set dernier_booster = now() where id = p_joueur;
    return;
  end if;
  gagnes := floor(extract(epoch from now() - p.dernier_booster) / 900)::int;
  if gagnes <= 0 then
    return;
  end if;
  total := least(10, p.boosters + gagnes);
  update public.profils
     set boosters = total,
         dernier_booster = case when total >= 10 then now() else p.dernier_booster + gagnes * interval '15 minutes' end
   where id = p_joueur;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Échanges : les crédits reçus sont taxés à 10 %
-- ---------------------------------------------------------------------------
create or replace function public.repondre_echange(p_offre uuid, p_accepter boolean) returns jsonb
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
  for ligne in select id, carte_id, variante from public.offres_lignes where offre = o.id and cote = 'a' loop
    ex := prive.exemplaire_libre(moi, ligne.carte_id, ligne.variante);
    if ex is null then
      raise exception 'Vous n''avez plus d''exemplaire libre de % (%)', ligne.carte_id, ligne.variante;
    end if;
    update public.exemplaires set bloque_par = o.id where id = ex;
    update public.offres_lignes set exemplaire = ex, numero_serie = (select numero_serie from public.exemplaires where id = ex)
     where id = ligne.id;
  end loop;
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
  -- Comme au marché, 10 % des crédits reçus sortent du jeu
  perform prive.crediter(moi, o.credits_de - ceil(o.credits_de * 0.10)::bigint, 'echange', o.id::text);
  perform prive.crediter(moi, -o.credits_a, 'echange', o.id::text);
  perform prive.crediter(o.de, o.credits_a - ceil(o.credits_a * 0.10)::bigint, 'echange', o.id::text);
  update public.offres set statut = 'acceptee', close_le = now() where id = o.id;
  return jsonb_build_object('accepte', true, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Codes
-- ---------------------------------------------------------------------------
-- Récompense : {"credits": 500, "dossiers": 3, "keter": 1, "cosmetique": "titre-…"} (chaque clé facultative)
create table if not exists prive.codes (
  code text primary key check (code = upper(code) and code ~ '^[A-Z0-9-]{3,32}$'),
  recompense jsonb not null,
  description text,
  utilisations_max int,
  expire_le timestamptz,
  cree_le timestamptz not null default now()
);
alter table prive.codes enable row level security;

create table if not exists prive.codes_utilises (
  code text not null references prive.codes on delete cascade,
  joueur uuid not null references public.profils on delete cascade,
  le timestamptz not null default now(),
  primary key (code, joueur)
);
alter table prive.codes_utilises enable row level security;

create table if not exists prive.codes_essais (
  joueur uuid not null references public.profils on delete cascade,
  le timestamptz not null default now()
);
create index if not exists codes_essais_joueur on prive.codes_essais (joueur, le desc);
alter table prive.codes_essais enable row level security;

create or replace function public.utiliser_code(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  saisi text := upper(trim(coalesce(p_code, '')));
  c prive.codes;
  r jsonb;
begin
  perform 1 from public.profils where id = moi for update;
  -- Dix essais par heure : on ne devine pas un code au hasard
  delete from prive.codes_essais where le < now() - interval '1 hour';
  if (select count(*) from prive.codes_essais where joueur = moi) >= 10 then
    raise exception 'Trop d''essais : réessayez dans une heure';
  end if;
  insert into prive.codes_essais (joueur) values (moi);
  select * into c from prive.codes where code = saisi;
  if not found or (c.expire_le is not null and c.expire_le < now())
     or (c.utilisations_max is not null and (select count(*) from prive.codes_utilises where code = c.code) >= c.utilisations_max) then
    -- Pas d'exception ici : elle effacerait l'essai compté plus haut
    return jsonb_build_object('erreur', 'Code inconnu ou expiré');
  end if;
  insert into prive.codes_utilises (code, joueur) values (c.code, moi) on conflict do nothing;
  if not found then
    raise exception 'Vous avez déjà utilisé ce code';
  end if;
  r := c.recompense;
  if coalesce((r ->> 'credits')::bigint, 0) > 0 then
    perform prive.crediter(moi, (r ->> 'credits')::bigint, 'code', c.code);
  end if;
  if coalesce((r ->> 'dossiers')::int, 0) > 0 then
    update public.profils set boosters = least(10, boosters + (r ->> 'dossiers')::int) where id = moi;
  end if;
  if coalesce((r ->> 'keter')::int, 0) > 0 then
    update public.profils set keter_offerts = keter_offerts + (r ->> 'keter')::int where id = moi;
  end if;
  if r ? 'cosmetique' and exists (select 1 from prive.cosmetiques where id = r ->> 'cosmetique') then
    insert into prive.cosmetiques_possedes (joueur, cosmetique) values (moi, r ->> 'cosmetique') on conflict do nothing;
  end if;
  return jsonb_build_object('recompense', r, 'description', c.description, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 5. Contrats de l'Intendance
-- ---------------------------------------------------------------------------
create or replace function prive.debut_semaine() returns date
language sql stable as $$ select date_trunc('week', now() at time zone 'Europe/Paris')::date $$;

create table if not exists prive.contrats (
  semaine date not null,
  rang int not null,
  carte_id text not null,
  primary key (semaine, rang)
);
alter table prive.contrats enable row level security;

create table if not exists prive.contrats_remplis (
  semaine date not null,
  joueur uuid not null references public.profils on delete cascade,
  carte_id text not null,
  le timestamptz not null default now(),
  primary key (semaine, joueur, carte_id)
);
alter table prive.contrats_remplis enable row level security;

-- Les trois fiches de la semaine (deux rares, une épique), tirées une fois pour tous les agents
create or replace function prive.contrats_semaine() returns setof prive.contrats
language plpgsql volatile as $$
declare
  s date := prive.debut_semaine();
begin
  if not exists (select 1 from prive.contrats where semaine = s) then
    insert into prive.contrats (semaine, rang, carte_id)
      select s, row_number() over (), id from (
        (select id from public.cartes where ra = 2 order by random() limit 2)
        union all
        (select id from public.cartes where ra = 3 order by random() limit 1)) x
    on conflict do nothing;
  end if;
  return query select * from prive.contrats where semaine = s order by rang;
end $$;

create or replace function public.contrats() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  return jsonb_build_object(
    'fin', (prive.debut_semaine() + 7)::timestamp at time zone 'Europe/Paris',
    'contrats', (select jsonb_agg(jsonb_build_object(
        'carte', k.carte_id,
        'rempli', exists (select 1 from prive.contrats_remplis r where r.semaine = k.semaine and r.joueur = moi and r.carte_id = k.carte_id),
        'libres', (select count(*) from public.exemplaires x where x.proprietaire = moi and x.carte_id = k.carte_id and x.variante = 'std'
                    and x.echangeable and x.bloque_par is null and x.origine <> 'souvenir'))
      order by k.rang) from prive.contrats_semaine() k));
end $$;

-- Remettre un exemplaire standard de la fiche demandée : il est détruit, un dossier Keter est offert
create or replace function public.remplir_contrat(p_carte text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  s date := prive.debut_semaine();
  ex uuid;
begin
  perform 1 from public.profils where id = moi for update;
  if not exists (select 1 from prive.contrats_semaine() k where k.carte_id = p_carte) then
    raise exception 'Cette fiche n''est pas demandée cette semaine';
  end if;
  ex := prive.exemplaire_libre(moi, p_carte, 'std');
  if ex is null then
    raise exception 'Il faut un exemplaire standard libre de cette fiche (ni en vente, ni en échange)';
  end if;
  insert into prive.contrats_remplis (semaine, joueur, carte_id) values (s, moi, p_carte) on conflict do nothing;
  if not found then
    raise exception 'Contrat déjà rempli cette semaine';
  end if;
  delete from public.exemplaires where id = ex;
  update public.profils set keter_offerts = keter_offerts + 1 where id = moi;
  perform prive.nettoyer_equipe(moi);
  return jsonb_build_object('contrats', public.contrats(), 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Cosmétiques du créateur
-- ---------------------------------------------------------------------------
insert into prive.cosmetiques (id, type, prix, ordre) values
  ('titre-createur', 'titre', null, 0),
  ('cadre-createur', 'cadre', null, 0)
on conflict (id) do update set type = excluded.type, prix = excluded.prix, ordre = excluded.ordre;

insert into prive.cosmetiques_possedes (joueur, cosmetique)
  select b.joueur, c from prive.badges_speciaux b, unnest(array['titre-createur', 'cadre-createur']) c where b.badge = 'createur'
on conflict do nothing;
update public.profils p set cosmetiques = p.cosmetiques || '{"titre": "titre-createur", "cadre": "cadre-createur"}'::jsonb
 where exists (select 1 from prive.badges_speciaux b where b.joueur = p.id and b.badge = 'createur');

-- Les pseudos à signer (pseudo animé), pour tous les écrans
create or replace function public.createurs() returns text[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(p.pseudo), '{}') from prive.badges_speciaux b join public.profils p on p.id = b.joueur
   where b.badge = 'createur' and p.pseudo is not null;
$$;

-- ---------------------------------------------------------------------------
-- 6. Succès
-- ---------------------------------------------------------------------------
-- Leurs récompenses : des titres et des cadres, jamais de crédits ni de dossiers
insert into prive.cosmetiques (id, type, prix, ordre) values
  ('titre-memoire', 'titre', null, 200),
  ('titre-archiviste-absolu', 'titre', null, 201),
  ('titre-gardien-mythiques', 'titre', null, 202),
  ('titre-prisme', 'titre', null, 203),
  ('titre-stratege', 'titre', null, 204),
  ('titre-negociant', 'titre', null, 205),
  ('titre-emissaire', 'titre', null, 206),
  ('cadre-archives-s', 'cadre', null, 200),
  ('cadre-archives-c', 'cadre', null, 201),
  ('cadre-archives-d', 'cadre', null, 202),
  ('cadre-archives-p', 'cadre', null, 203),
  ('cadre-archives-f', 'cadre', null, 204),
  ('cadre-archives-g', 'cadre', null, 205),
  ('cadre-archives-n', 'cadre', null, 206),
  ('cadre-archives-e', 'cadre', null, 207),
  ('cadre-archives-l', 'cadre', null, 208),
  ('cadre-archives-o', 'cadre', null, 209)
on conflict (id) do update set type = excluded.type, prix = excluded.prix, ordre = excluded.ordre;

-- seuil vide : le total (toutes les fiches, toutes les Mythiques, tout un type, toutes les collections…)
create table if not exists prive.succes_def (
  id text primary key,
  categorie text not null,
  nom text not null,
  description text not null,
  mesure text not null,
  seuil int,
  recompense text references prive.cosmetiques,
  ordre int not null
);
alter table prive.succes_def enable row level security;

insert into prive.succes_def (id, categorie, nom, description, mesure, seuil, recompense, ordre) values
  ('fiches-50', 'Collection', 'Premier classeur', 'Posséder 50 fiches différentes.', 'fiches', 50, null, 1),
  ('fiches-500', 'Collection', 'Rayonnages', 'Posséder 500 fiches différentes.', 'fiches', 500, null, 2),
  ('fiches-2000', 'Collection', 'Salle des archives', 'Posséder 2 000 fiches différentes.', 'fiches', 2000, null, 3),
  ('fiches-5000', 'Collection', 'Dépôt central', 'Posséder 5 000 fiches différentes.', 'fiches', 5000, null, 4),
  ('fiches-10000', 'Collection', 'Mémoire de la Fondation', 'Posséder 10 000 fiches différentes.', 'fiches', 10000, 'titre-memoire', 5),
  ('fiches-toutes', 'Collection', 'Archiviste absolu', 'Posséder toutes les fiches du catalogue.', 'fiches', null, 'titre-archiviste-absolu', 6),
  ('legendaires-1', 'Raretés', 'Accès niveau 4', 'Posséder une Légendaire.', 'legendaires', 1, null, 10),
  ('legendaires-10', 'Raretés', 'Panthéon', 'Posséder 10 Légendaires ou Mythiques différentes.', 'legendaires', 10, null, 11),
  ('legendaires-50', 'Raretés', 'Coffre-fort', 'Posséder 50 Légendaires ou Mythiques différentes.', 'legendaires', 50, null, 12),
  ('legendaires-150', 'Raretés', 'Chambre forte', 'Posséder 150 Légendaires ou Mythiques différentes.', 'legendaires', 150, null, 13),
  ('mythiques-1', 'Raretés', 'Niveau 5', 'Posséder une Mythique.', 'mythiques', 1, null, 14),
  ('mythiques-toutes', 'Raretés', 'Gardien des Mythiques', 'Posséder toutes les Mythiques.', 'mythiques', null, 'titre-gardien-mythiques', 15),
  ('premiere-edition', 'Raretés', 'Première édition', 'Posséder une Mythique numérotée de 1 à 5.', 'premiere_edition', 1, null, 16),
  ('variantes-10', 'Variantes', 'Œil exercé', 'Posséder 10 variantes différentes (carte et variante).', 'variantes', 10, null, 20),
  ('variantes-100', 'Variantes', 'Cabinet des curiosités', 'Posséder 100 variantes différentes.', 'variantes', 100, null, 21),
  ('variantes-500', 'Variantes', 'Musée des anomalies', 'Posséder 500 variantes différentes.', 'variantes', 500, null, 22),
  ('breche-1', 'Variantes', 'Fuite de confinement', 'Posséder une carte en Brèche.', 'breche', 1, null, 23),
  ('breche-25', 'Variantes', 'Brèche généralisée', 'Posséder 25 cartes différentes en Brèche.', 'breche', 25, null, 24),
  ('o5-1', 'Variantes', 'Sceau du Conseil', 'Posséder une carte au Sceau O5.', 'o5', 1, null, 25),
  ('o5-10', 'Variantes', 'Confiance du Conseil', 'Posséder 10 cartes différentes au Sceau O5.', 'o5', 10, null, 26),
  ('haute-1', 'Variantes', 'Légende irisée', 'Posséder une Légendaire ou une Mythique dans une variante.', 'variante_haute', 1, null, 27),
  ('haute-10', 'Variantes', 'Galerie des légendes', 'Posséder 10 Légendaires ou Mythiques en variante.', 'variante_haute', 10, null, 28),
  ('arc-en-ciel', 'Variantes', 'Arc-en-ciel', 'Réunir les 5 variantes d’une même carte (holographique, expurgée, archive, Brèche, Sceau O5).', 'arc_en_ciel', 1, 'titre-prisme', 29),
  ('archives-l', 'Archives complètes', 'Tous les Sites', 'Posséder toutes les fiches de Sites.', 'type:l', null, 'cadre-archives-l', 30),
  ('archives-e', 'Archives complètes', 'Tous les départements', 'Posséder toutes les fiches de départements.', 'type:e', null, 'cadre-archives-e', 31),
  ('archives-o', 'Archives complètes', 'Tous les protocoles', 'Posséder toutes les fiches de protocoles.', 'type:o', null, 'cadre-archives-o', 32),
  ('archives-g', 'Archives complètes', 'Tous les Groupes d’intérêt', 'Posséder toutes les fiches de Groupes d’intérêt.', 'type:g', null, 'cadre-archives-g', 33),
  ('archives-n', 'Archives complètes', 'Tous les canons', 'Posséder toutes les fiches de canons.', 'type:n', null, 'cadre-archives-n', 34),
  ('archives-f', 'Archives complètes', 'Toutes les FIM', 'Posséder toutes les fiches d’équipes FIM.', 'type:f', null, 'cadre-archives-f', 35),
  ('archives-p', 'Archives complètes', 'Tout le personnel', 'Posséder toutes les fiches du personnel.', 'type:p', null, 'cadre-archives-p', 36),
  ('archives-d', 'Archives complètes', 'Tous les documents', 'Posséder tous les documents de Groupes d’intérêt.', 'type:d', null, 'cadre-archives-d', 37),
  ('archives-c', 'Archives complètes', 'Tous les contes', 'Posséder tous les contes.', 'type:c', null, 'cadre-archives-c', 38),
  ('archives-s', 'Archives complètes', 'Tous les SCP', 'Posséder toutes les fiches SCP.', 'type:s', null, 'cadre-archives-s', 39),
  ('ia-10', 'Confrontation', 'Entraînement', 'Gagner 10 confrontations contre l’IA.', 'victoires_ia', 10, null, 40),
  ('ia-100', 'Confrontation', 'Instructeur', 'Gagner 100 confrontations contre l’IA.', 'victoires_ia', 100, null, 41),
  ('jcj-1', 'Confrontation', 'Premier sang', 'Gagner un duel entre agents.', 'victoires_jcj', 1, null, 42),
  ('jcj-25', 'Confrontation', 'Vétéran', 'Gagner 25 duels entre agents.', 'victoires_jcj', 25, null, 43),
  ('jcj-100', 'Confrontation', 'Légende des duels', 'Gagner 100 duels entre agents.', 'victoires_jcj', 100, null, 44),
  ('elo-1200', 'Confrontation', 'Agent d’élite', 'Atteindre 1 200 Elo.', 'elo', 1200, null, 45),
  ('elo-1500', 'Confrontation', 'Stratège du Site-19', 'Atteindre 1 500 Elo.', 'elo', 1500, 'titre-stratege', 46),
  ('ventes-1', 'Marché', 'Première vente', 'Vendre une carte aux enchères.', 'ventes', 1, null, 50),
  ('ventes-25', 'Marché', 'Négociant', 'Vendre 25 cartes aux enchères.', 'ventes', 25, 'titre-negociant', 51),
  ('achats-1', 'Marché', 'Premier achat', 'Remporter une enchère.', 'achats', 1, null, 52),
  ('achats-25', 'Marché', 'Collectionneur averti', 'Remporter 25 enchères.', 'achats', 25, null, 53),
  ('echanges-1', 'Marché', 'Poignée de main', 'Conclure un échange.', 'echanges', 1, null, 54),
  ('echanges-10', 'Marché', 'Diplomate', 'Conclure 10 échanges.', 'echanges', 10, null, 55),
  ('dossiers-100', 'Intendance', 'Ouvre-lettres', 'Ouvrir 100 dossiers.', 'dossiers', 100, null, 60),
  ('dossiers-1000', 'Intendance', 'Coupe-papier', 'Ouvrir 1 000 dossiers.', 'dossiers', 1000, null, 61),
  ('dossiers-5000', 'Intendance', 'Broyeuse', 'Ouvrir 5 000 dossiers.', 'dossiers', 5000, null, 62),
  ('fusions-1', 'Intendance', 'Alchimiste', 'Fusionner des doublons.', 'fusions', 1, null, 63),
  ('fusions-50', 'Intendance', 'Grand alchimiste', 'Fusionner 50 fois.', 'fusions', 50, null, 64),
  ('contrats-1', 'Intendance', 'Fournisseur', 'Remplir un contrat de l’Intendance.', 'contrats', 1, null, 65),
  ('contrats-20', 'Intendance', 'Fournisseur agréé', 'Remplir 20 contrats de l’Intendance.', 'contrats', 20, null, 66),
  ('albums-1', 'Collections', 'Première page', 'Compléter une page de l’album.', 'albums', 1, null, 70),
  ('albums-tous', 'Collections', 'Album complet', 'Compléter toutes les pages de l’album.', 'albums', null, null, 71),
  ('collections-1', 'Collections', 'Infiltré', 'Compléter une collection de Groupe d’intérêt.', 'collections', 1, null, 72),
  ('collections-toutes', 'Collections', 'Émissaire', 'Compléter toutes les collections de Groupes d’intérêt.', 'collections', null, 'titre-emissaire', 73)
on conflict (id) do update set categorie = excluded.categorie, nom = excluded.nom, description = excluded.description,
  mesure = excluded.mesure, seuil = excluded.seuil, recompense = excluded.recompense, ordre = excluded.ordre;

create table if not exists prive.succes_obtenus (
  joueur uuid not null references public.profils on delete cascade,
  succes text not null references prive.succes_def on delete cascade,
  le timestamptz not null default now(),
  primary key (joueur, succes)
);
alter table prive.succes_obtenus enable row level security;

-- Les mesures d'un agent et leurs totaux possibles, d'un seul passage sur sa collection
create or replace function prive.mesures_succes(p_joueur uuid) returns jsonb
language sql stable as $$
  with x as (
    select e.carte_id, e.variante, e.numero_serie, c.ra, c.k
      from public.exemplaires e join public.cartes c on c.id = e.carte_id
     where e.proprietaire = p_joueur
  ),
  d as (select distinct carte_id, ra, k from x),
  p as (select * from public.profils where id = p_joueur)
  select jsonb_build_object(
    'fiches', (select count(*) from d),
    'legendaires', (select count(*) from d where ra >= 4),
    'mythiques', (select count(*) from d where ra = 5),
    'premiere_edition', (select count(*) from x where ra = 5 and numero_serie <= 5),
    'variantes', (select count(*) from (select distinct carte_id, variante from x where variante <> 'std') v),
    'breche', (select count(distinct carte_id) from x where variante = 'breche'),
    'o5', (select count(distinct carte_id) from x where variante = 'o5'),
    'variante_haute', (select count(*) from (select distinct carte_id, variante from x where variante <> 'std' and ra >= 4) v),
    'arc_en_ciel', (select count(*) from (select carte_id from x where variante in ('holo', 'exp', 'arch', 'breche', 'o5')
                                           group by carte_id having count(distinct variante) = 5) a),
    'victoires_ia', (select coalesce((stats ->> 'victoires')::int, 0) from p),
    'victoires_jcj', (select coalesce((jcj ->> 'victoires')::int, 0) from p),
    'elo', (select elo from p),
    'dossiers', (select coalesce((stats ->> 'boostersOuverts')::int, 0) from p),
    'ventes', (select count(*) from public.encheres where vendeur = p_joueur and statut = 'vendue'),
    'achats', (select count(*) from public.encheres where encherisseur = p_joueur and statut = 'vendue'),
    'echanges', (select count(*) from public.offres where p_joueur in (de, a) and statut = 'acceptee'),
    'fusions', (select count(*) from prive.fusions where joueur = p_joueur),
    'contrats', (select count(*) from prive.contrats_remplis where joueur = p_joueur),
    'albums', (select count(*) from prive.albums_reclames where joueur = p_joueur),
    'collections', (select count(*) from prive.collections_reclamees where joueur = p_joueur))
  || coalesce((select jsonb_object_agg('type:' || k, n) from (select k, count(*) as n from d group by k) t), '{}'::jsonb);
$$;

create or replace function prive.totaux_succes() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'fiches', (select count(*) from public.cartes),
    'mythiques', (select count(*) from public.cartes where ra = 5),
    'albums', (select count(*) from prive.pages_album()),
    'collections', (select count(*) from prive.collections))
  || coalesce((select jsonb_object_agg('type:' || k, n) from (select k, count(*) as n from public.cartes group by k) t), '{}'::jsonb);
$$;

create or replace function public.succes() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  m jsonb := prive.mesures_succes(moi);
  t jsonb := prive.totaux_succes();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', s.id, 'categorie', s.categorie, 'nom', s.nom, 'description', s.description, 'recompense', s.recompense,
        'valeur', coalesce((m ->> s.mesure)::int, 0),
        'seuil', coalesce(s.seuil, (t ->> s.mesure)::int, 0),
        'obtenu', (select o.le from prive.succes_obtenus o where o.joueur = moi and o.succes = s.id))
      order by s.ordre)
    from prive.succes_def s), '[]'::jsonb);
end $$;

-- Réclamer des succès atteints (tous ceux de la liste) : la date est gravée, la récompense éventuelle est remise
create or replace function public.reclamer_succes(p_ids text[]) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  m jsonb := prive.mesures_succes(moi);
  t jsonb := prive.totaux_succes();
  s record;
  n int := 0;
begin
  perform 1 from public.profils where id = moi for update;
  for s in select * from prive.succes_def where id = any (coalesce(p_ids, '{}')) loop
    continue when coalesce((m ->> s.mesure)::int, 0) < coalesce(s.seuil, (t ->> s.mesure)::int, 2147483647)
              or coalesce(s.seuil, (t ->> s.mesure)::int, 0) <= 0;
    insert into prive.succes_obtenus (joueur, succes) values (moi, s.id) on conflict do nothing;
    if found then
      n := n + 1;
      if s.recompense is not null then
        insert into prive.cosmetiques_possedes (joueur, cosmetique) values (moi, s.recompense) on conflict do nothing;
      end if;
    end if;
  end loop;
  return jsonb_build_object('reclames', n, 'succes', public.succes());
end $$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function public.utiliser_code(text), public.contrats(), public.remplir_contrat(text), public.createurs(),
  public.succes(), public.reclamer_succes(text[]) from public, anon;
grant execute on function public.utiliser_code(text), public.contrats(), public.remplir_contrat(text), public.createurs(),
  public.succes(), public.reclamer_succes(text[]) to authenticated;
