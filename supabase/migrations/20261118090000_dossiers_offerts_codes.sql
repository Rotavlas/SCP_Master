-- SCP Masters : dossiers offerts de tout type, codes qui peuvent tout donner, gestion des codes par le créateur.
--  1. Une réserve de dossiers offerts par type (profils.dossiers_offerts : {"o5": 2, "apollyon": 1, …}), qu'on ouvre
--     depuis l'écran des dossiers. Le Keter offert du Rapport et de la piste garde sa réserve à lui.
--  2. Un code peut donner : crédits, XP, dossiers gratuits, dossiers offerts de n'importe quel type (Apollyon compris),
--     cosmétiques, cartes précises dans une variante (une Mythique prend un numéro de son édition limitée).
--  3. Le créateur (badge « createur ») crée, désactive et supprime les codes depuis le jeu (menu du compte).
-- À exécuter dans le SQL Editor de Supabase, après 20261117090000_rarete_codes_contrats_succes.sql.

alter table public.profils add column if not exists dossiers_offerts jsonb not null default '{}';

-- Le profil envoyé au jeu montre aussi les dossiers offerts
create or replace function prive.profil_json(p_joueur uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'pseudo', pseudo, 'credits', credits, 'xp', xp, 'boosters', boosters,
    'dernier_booster', dernier_booster, 'meilleur_adversaire', meilleur_adversaire, 'stats', stats,
    'equipe', equipe, 'favoris', favoris, 'souhaits', souhaits, 'nouvelles', nouvelles,
    'affichage', affichage, 'langue', langue, 'souvenir_importe', souvenir_importe, 'keter_offerts', keter_offerts,
    'dossiers_offerts', dossiers_offerts)
  from public.profils where id = p_joueur;
$$;

-- ---------------------------------------------------------------------------
-- 1. L'ouverture d'un dossier offert, de tout type
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
  perform prive.crediter_boosters(moi);
  select * into p from public.profils where id = moi for update;
  -- Depuis le stock : le dossier gratuit, ou un dossier offert (Keter du Rapport et de la piste ; tout type par un code)
  if p_depuis_stock and not t.depuis_stock then
    if p_type = 'keter' then
      if p.keter_offerts <= 0 and coalesce((p.dossiers_offerts ->> 'keter')::int, 0) <= 0 then
        raise exception 'Aucun dossier Keter offert';
      end if;
    elsif coalesce((p.dossiers_offerts ->> p_type)::int, 0) <= 0 then
      raise exception 'Ce booster ne s''obtient pas gratuitement (aucun dossier de ce type offert)';
    end if;
  end if;
  if p_depuis_stock and t.depuis_stock and p.boosters <= 0 then
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
    boosters = case when p_depuis_stock and t.depuis_stock then boosters - 1 else boosters end,
    -- Un Keter offert se prend d'abord sur la réserve historique (Rapport, piste), puis sur celle des codes
    keter_offerts = case when p_depuis_stock and p_type = 'keter' and keter_offerts > 0 then keter_offerts - 1 else keter_offerts end,
    dossiers_offerts = case
      when p_depuis_stock and not t.depuis_stock and not (p_type = 'keter' and keter_offerts > 0)
        then jsonb_set(dossiers_offerts, array[p_type], to_jsonb(greatest(0, coalesce((dossiers_offerts ->> p_type)::int, 0) - 1)))
      else dossiers_offerts end,
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
-- 2. Les récompenses d'un code
-- ---------------------------------------------------------------------------
-- {"credits": 500, "xp": 200, "dossiers": 3, "offerts": {"apollyon": 1, "o5": 2}, "cosmetiques": ["titre-…"],
--  "cartes": [{"c": "scp-173", "v": "holo", "n": 1}]}   (anciennes clés acceptées : "keter", "cosmetique")
create or replace function prive.valider_recompense(r jsonb) returns void
language plpgsql stable as $$
declare
  k text;
  x jsonb;
  total int := 0;
begin
  if r is null or jsonb_typeof(r) <> 'object' then
    raise exception 'Récompense invalide';
  end if;
  for k in select jsonb_object_keys(r) loop
    if k not in ('credits', 'xp', 'dossiers', 'keter', 'offerts', 'cosmetique', 'cosmetiques', 'cartes') then
      raise exception 'Récompense inconnue : %', k;
    end if;
  end loop;
  if coalesce((r ->> 'credits')::bigint, 0) not between 0 and 10000000 or coalesce((r ->> 'xp')::int, 0) not between 0 and 1000000
     or coalesce((r ->> 'dossiers')::int, 0) not between 0 and 10 or coalesce((r ->> 'keter')::int, 0) not between 0 and 100 then
    raise exception 'Montant hors limites';
  end if;
  if r ? 'offerts' then
    for k, x in select key, value from jsonb_each(r -> 'offerts') loop
      if not exists (select 1 from prive.types_boosters where id = k) or (x #>> '{}')::int not between 0 and 100 then
        raise exception 'Dossier offert invalide : %', k;
      end if;
    end loop;
  end if;
  for k in select coalesce(r ->> 'cosmetique', '') union select jsonb_array_elements_text(coalesce(r -> 'cosmetiques', '[]')) loop
    if k <> '' and not exists (select 1 from prive.cosmetiques where id = k) then
      raise exception 'Cosmétique inconnu : %', k;
    end if;
  end loop;
  for x in select jsonb_array_elements(coalesce(r -> 'cartes', '[]')) loop
    if not exists (select 1 from public.cartes where id = x ->> 'c') then
      raise exception 'Carte inconnue : %', x ->> 'c';
    end if;
    if coalesce(x ->> 'v', 'std') not in ('std', 'holo', 'exp', 'arch', 'breche', 'o5', 'negatif', 'esquisse')
       or (coalesce(x ->> 'v', 'std') in ('negatif', 'esquisse') and (select ra from public.cartes where id = x ->> 'c') <> 5) then
      raise exception 'Variante impossible pour %', x ->> 'c';
    end if;
    total := total + coalesce((x ->> 'n')::int, 1);
  end loop;
  if total > 20 then
    raise exception 'Vingt cartes au plus par code';
  end if;
end $$;

-- Remet la récompense à un agent
create or replace function prive.remettre_recompense(p_joueur uuid, r jsonb, p_reference text) returns void
language plpgsql volatile as $$
declare
  k text;
  x jsonb;
  i int;
  numero int;
  rarete int;
  v text;
begin
  if coalesce((r ->> 'credits')::bigint, 0) > 0 then
    perform prive.crediter(p_joueur, (r ->> 'credits')::bigint, 'code', p_reference);
  end if;
  if coalesce((r ->> 'xp')::int, 0) > 0 then
    update public.profils set xp = xp + (r ->> 'xp')::int where id = p_joueur;
  end if;
  if coalesce((r ->> 'dossiers')::int, 0) > 0 then
    update public.profils set boosters = least(10, boosters + (r ->> 'dossiers')::int) where id = p_joueur;
  end if;
  if coalesce((r ->> 'keter')::int, 0) > 0 then
    update public.profils set keter_offerts = keter_offerts + (r ->> 'keter')::int where id = p_joueur;
  end if;
  for k, x in select key, value from jsonb_each(coalesce(r -> 'offerts', '{}')) loop
    continue when (x #>> '{}')::int <= 0;
    if k = 'keter' then
      update public.profils set keter_offerts = keter_offerts + (x #>> '{}')::int where id = p_joueur;
    elsif k = 'standard' then
      update public.profils set boosters = least(10, boosters + (x #>> '{}')::int) where id = p_joueur;
    else
      update public.profils
         set dossiers_offerts = jsonb_set(dossiers_offerts, array[k], to_jsonb(coalesce((dossiers_offerts ->> k)::int, 0) + (x #>> '{}')::int))
       where id = p_joueur;
    end if;
  end loop;
  for k in select coalesce(r ->> 'cosmetique', '') union select jsonb_array_elements_text(coalesce(r -> 'cosmetiques', '[]')) loop
    continue when k = '';
    insert into prive.cosmetiques_possedes (joueur, cosmetique) values (p_joueur, k) on conflict do nothing;
  end loop;
  for x in select jsonb_array_elements(coalesce(r -> 'cartes', '[]')) loop
    v := coalesce(x ->> 'v', 'std');
    select ra into rarete from public.cartes where id = x ->> 'c';
    for i in 1 .. coalesce((x ->> 'n')::int, 1) loop
      -- Une Mythique prend un numéro de son édition limitée : épuisée, elle ne se donne plus
      numero := case when rarete = 5 then prive.numero_mythique(x ->> 'c') else prive.prochain_numero(x ->> 'c', v) end;
      if numero is null then
        raise exception 'Édition épuisée pour %', x ->> 'c';
      end if;
      insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine)
        values (p_joueur, x ->> 'c', v, numero, 'recompense');
    end loop;
    update public.profils set
      nouvelles = case when x ->> 'c' = any (nouvelles) then nouvelles else array_append(nouvelles, x ->> 'c') end,
      souhaits = array_remove(souhaits, x ->> 'c')
    where id = p_joueur;
  end loop;
end $$;

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
  perform prive.remettre_recompense(moi, c.recompense, c.code);
  return jsonb_build_object('recompense', c.recompense, 'description', c.description, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 3. La gestion des codes par le créateur
-- ---------------------------------------------------------------------------
create or replace function prive.exiger_createur() returns uuid
language plpgsql stable as $$
declare
  moi uuid := prive.joueur();
begin
  if not exists (select 1 from prive.badges_speciaux where joueur = moi and badge = 'createur') then
    raise exception 'Réservé au créateur du jeu';
  end if;
  return moi;
end $$;

create or replace function public.codes_admin() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'code', c.code, 'description', c.description, 'recompense', c.recompense,
        'utilisationsMax', c.utilisations_max, 'expireLe', c.expire_le, 'creeLe', c.cree_le,
        'utilisations', (select count(*) from prive.codes_utilises u where u.code = c.code),
        'actif', (c.expire_le is null or c.expire_le > now())
                 and (c.utilisations_max is null or (select count(*) from prive.codes_utilises u where u.code = c.code) < c.utilisations_max))
      order by c.cree_le desc)
    from prive.codes c), '[]'::jsonb);
end $$;

create or replace function public.creer_code(p_code text, p_recompense jsonb, p_description text, p_utilisations_max int, p_expire_le timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  saisi text := upper(trim(coalesce(p_code, '')));
begin
  perform prive.exiger_createur();
  if saisi !~ '^[A-Z0-9-]{3,32}$' then
    raise exception 'Code : 3 à 32 lettres majuscules, chiffres ou tirets';
  end if;
  if exists (select 1 from prive.codes where code = saisi) then
    raise exception 'Ce code existe déjà';
  end if;
  if p_utilisations_max is not null and p_utilisations_max < 1 then
    raise exception 'Nombre d''utilisations invalide';
  end if;
  perform prive.valider_recompense(p_recompense);
  if p_recompense = '{}'::jsonb then
    raise exception 'Le code ne donne rien';
  end if;
  insert into prive.codes (code, recompense, description, utilisations_max, expire_le)
    values (saisi, p_recompense, nullif(trim(coalesce(p_description, '')), ''), p_utilisations_max, p_expire_le);
  return public.codes_admin();
end $$;

-- Désactiver tout de suite (le code reste dans la liste, avec ses utilisations)
create or replace function public.desactiver_code(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  update prive.codes set expire_le = now() where code = upper(p_code);
  return public.codes_admin();
end $$;

create or replace function public.supprimer_code(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform prive.exiger_createur();
  delete from prive.codes where code = upper(p_code);
  return public.codes_admin();
end $$;

revoke execute on function public.codes_admin(), public.creer_code(text, jsonb, text, int, timestamptz), public.desactiver_code(text),
  public.supprimer_code(text) from public, anon;
grant execute on function public.codes_admin(), public.creer_code(text, jsonb, text, int, timestamptz), public.desactiver_code(text),
  public.supprimer_code(text) to authenticated;
