-- SCP Masters : les dossiers Keter et O5 ne s'achètent qu'en nombre limité par jour (3 Keter, 1 O5), remis à zéro à
-- minuit, heure de Paris. Vendre toute sa collection pour enchaîner les dossiers O5 ne permet plus de multiplier
-- les chances de Mythique. Les dossiers gratuits (stock) ne sont pas concernés. Les achats du jour se comptent dans
-- public.mouvements_credits (motif 'booster', référence : le type de dossier).
-- Valeurs à garder synchronisées avec PAR_JOUR (src/engine/boosters.ts).
-- À exécuter dans le SQL Editor de Supabase.

alter table prive.types_boosters add column if not exists par_jour int;
update prive.types_boosters set par_jour = case id when 'keter' then 3 when 'o5' then 1 end;

-- Minuit, heure de Paris
create or replace function prive.debut_du_jour() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

create or replace function prive.achats_du_jour(p_joueur uuid, p_type text) returns int
language sql stable as $$
  select count(*)::int from public.mouvements_credits
   where joueur = p_joueur and motif = 'booster' and reference = p_type and le >= prive.debut_du_jour();
$$;

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
  essai int;
  deja text[] := '{}';
  tirage jsonb := '[]'::jsonb;
  possedees text[];
begin
  select * into t from prive.types_boosters where id = p_type;
  if not found then
    raise exception 'Booster inconnu : %', p_type;
  end if;
  if p_depuis_stock and not t.depuis_stock then
    raise exception 'Ce booster ne s''obtient pas gratuitement';
  end if;

  perform prive.crediter_boosters(moi);
  select * into p from public.profils where id = moi for update;
  if p_depuis_stock and p.boosters <= 0 then
    raise exception 'Aucun dossier en stock';
  end if;
  if not p_depuis_stock and p.credits < t.prix then
    raise exception 'Crédits insuffisants';
  end if;
  -- Les dossiers Keter et O5 s'achètent en nombre limité par jour (heure de Paris)
  if not p_depuis_stock and t.par_jour is not null and prive.achats_du_jour(moi, p_type) >= t.par_jour then
    raise exception 'Limite du jour atteinte pour ce dossier (% par jour) : de nouveaux achats seront possibles à minuit', t.par_jour;
  end if;

  select coalesce(array_agg(distinct carte_id), '{}') into possedees from public.exemplaires where proprietaire = moi;

  for i in 1 .. 5 loop
    carte := null;
    -- Une Mythique, très rarement : toujours en version standard, numérotée dans l'ordre d'obtention
    if random() < t.mythique then
      select id into carte from public.cartes where ra = 5 and not id = any (deja) order by random() limit 1;
      variante := 'std';
    end if;
    if carte is null then
      rarete := prive.tirer_indice(case when i = 5 then t.poids_derniere else t.poids end);
      carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
      -- Évite deux fois la même carte dans un même dossier
      essai := 0;
      while carte = any (deja) and essai < 5 loop
        carte := prive.tirer_carte(prive.tirer_type(t.types), rarete);
        essai := essai + 1;
      end loop;
      variante := prive.tirer_variante(t.bonus_variante);
    end if;
    deja := deja || carte;
    numero := prive.prochain_numero(carte, variante);
    insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine)
      values (moi, carte, variante, numero, 'booster');
    tirage := tirage || jsonb_build_object('id', carte, 'v', variante, 'n', numero);
  end loop;

  update public.profils set
    boosters = case when p_depuis_stock then boosters - 1 else boosters end,
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

-- Les achats encore possibles aujourd'hui, pour l'Intendance : {"keter": 2, "o5": 0}
create or replace function public.achats_restants() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(id, greatest(0, par_jour - prive.achats_du_jour(prive.joueur(), id))), '{}'::jsonb)
  from prive.types_boosters where par_jour is not null;
$$;

revoke execute on function public.achats_restants() from public, anon;
grant execute on function public.achats_restants() to authenticated;
