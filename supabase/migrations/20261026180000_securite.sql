-- SCP Masters : durcissement de la sécurité.
-- Aucune requête n'est construite à partir de texte (pas de SQL dynamique) : les paramètres des
-- fonctions ne peuvent pas injecter de SQL. Cette migration ferme les moyens restants de se donner
-- des cartes ou des crédits, et verrouille ce qui sera ajouté plus tard.

-- ---------------------------------------------------------------------------
-- 1. Plus d'import de partie locale : son contenu venait du navigateur, donc modifiable à volonté
--    (n'importe qui pouvait s'offrir 50 exemplaires de chaque légendaire, en variante O5).
-- ---------------------------------------------------------------------------
drop function if exists public.importer_souvenir(jsonb);

-- ---------------------------------------------------------------------------
-- 2. Ce qui sera créé plus tard dans public n'est exposé qu'avec un droit explicite
-- ---------------------------------------------------------------------------
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Duels : un seul duel ouvert à la fois, et fin de duel sérialisée par joueur.
--    Sans cela, on pouvait ouvrir des dizaines de duels d'un coup puis les terminer
--    en parallèle, au-delà du plafond quotidien.
-- ---------------------------------------------------------------------------
create or replace function public.debuter_duel(p_niveau int) returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  a prive.adversaires;
  xp_joueur int;
  id_duel uuid;
begin
  select xp into xp_joueur from public.profils where id = moi for update;
  select * into a from prive.adversaires where niveau = p_niveau;
  if not found then
    raise exception 'Adversaire inconnu';
  end if;
  if a.accreditation > prive.accreditation(xp_joueur) then
    raise exception 'Accréditation insuffisante';
  end if;
  -- Un duel laissé en plan est perdu, sans récompense
  update prive.duels_ia set fin = now(), issue = 'defaite', bonnes = 0, credits = 0, xp = 0
   where joueur = moi and fin is null;
  insert into prive.duels_ia (joueur, niveau) values (moi, p_niveau) returning id into id_duel;
  return id_duel;
end $$;

create or replace function public.terminer_duel(p_duel uuid, p_issue text, p_bonnes int, p_questions int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  d prive.duels_ia;
  a prive.adversaires;
  credits_gagnes int;
  xp_gagne int;
  du_jour int;
begin
  -- Verrou sur le profil : deux fins de duel du même joueur ne se croisent pas
  perform 1 from public.profils where id = moi for update;
  select * into d from prive.duels_ia where id = p_duel and joueur = moi for update;
  if not found or d.fin is not null then
    raise exception 'Duel introuvable ou déjà terminé';
  end if;
  if p_issue is null or p_issue not in ('victoire', 'defaite', 'nul') or p_questions is null or p_bonnes is null
     or p_questions not between 1 and 5 or p_bonnes not between 0 and p_questions then
    raise exception 'Résultat invalide';
  end if;
  select * into a from prive.adversaires where niveau = d.niveau;

  credits_gagnes := case p_issue when 'victoire' then a.gain + p_bonnes * 5 when 'nul' then round(a.gain / 3.0) else 10 end;
  xp_gagne := case p_issue when 'victoire' then a.xp when 'nul' then round(a.xp / 2.0) else 15 end;

  select count(*) into du_jour from prive.duels_ia
   where joueur = moi and fin > now() - interval '1 day' and credits > 0;
  -- Une partie de 5 manches prend plus de 15 secondes, même en répondant très vite
  if now() - d.debut < interval '15 seconds' or du_jour >= 30 then
    credits_gagnes := 0;
    xp_gagne := 0;
  end if;

  update prive.duels_ia set fin = now(), issue = p_issue, bonnes = p_bonnes, credits = credits_gagnes, xp = xp_gagne
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
  where id = moi;
  if credits_gagnes > 0 then
    insert into public.mouvements_credits (joueur, montant, motif, reference) values (moi, credits_gagnes, 'duel', p_duel::text);
  end if;
  return jsonb_build_object('credits', credits_gagnes, 'xp', xp_gagne, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Préférences : seulement des identifiants de cartes du catalogue, en quantité bornée
-- ---------------------------------------------------------------------------

-- Les identifiants valides d'une liste JSON, sans doublon, dans leur ordre d'origine
create function prive.ids_valides(p jsonb, limite int) returns text[]
language sql stable as $$
  select coalesce(array_agg(e.id order by e.rang), '{}')
  from (
    select distinct on (v.id) v.id, v.rang
    from (
      select id, rang from jsonb_array_elements_text(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
        with ordinality t(id, rang)
      limit limite
    ) v
    join public.cartes c on c.id = v.id
    order by v.id, v.rang
  ) e;
$$;

create or replace function public.maj_preferences(p jsonb) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  nouvelle_equipe text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Préférences invalides';
  end if;
  if pg_column_size(p) > 200000 then
    raise exception 'Préférences trop volumineuses';
  end if;
  if p ? 'equipe' then
    if jsonb_typeof(p -> 'equipe') <> 'array' or jsonb_array_length(p -> 'equipe') > 5 then
      raise exception 'Équipe invalide';
    end if;
    select coalesce(array_agg(e), '{}') into nouvelle_equipe from jsonb_array_elements_text(p -> 'equipe') e;
    if exists (
      select 1 from unnest(nouvelle_equipe) e
      where not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = e)) then
      raise exception 'Équipe invalide';
    end if;
    update public.profils set equipe = nouvelle_equipe where id = moi;
  end if;
  if p ? 'favoris' then
    update public.profils set favoris = prive.ids_valides(p -> 'favoris', 5000) where id = moi;
  end if;
  if p ? 'souhaits' then
    update public.profils set souhaits = prive.ids_valides(p -> 'souhaits', 2000) where id = moi;
  end if;
  if p ? 'nouvelles' then
    update public.profils set nouvelles = prive.ids_valides(p -> 'nouvelles', 5000) where id = moi;
  end if;
  if p ? 'affichage' and jsonb_typeof(p -> 'affichage') = 'object' then
    -- Variante affichée par carte : cartes du catalogue et variantes connues uniquement
    update public.profils set affichage = (
      select coalesce(jsonb_object_agg(a.key, a.value), '{}')
      from (select key, value from jsonb_each_text(p -> 'affichage') limit 5000) a
      join public.cartes c on c.id = a.key
      where a.value in ('std', 'holo', 'exp', 'arch', 'breche', 'o5'))
    where id = moi;
  end if;
  if p ? 'langue' and p ->> 'langue' in ('vo', 'vf') then
    update public.profils set langue = p ->> 'langue' where id = moi;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Les fonctions à privilèges ne cherchent les objets que dans public, et le schéma temporaire en dernier
-- ---------------------------------------------------------------------------
alter function public.mon_etat() set search_path = public, pg_temp;
alter function public.definir_pseudo(text) set search_path = public, pg_temp;
alter function public.ouvrir_booster(text, boolean) set search_path = public, pg_temp;
alter function public.recycler_doublons(text) set search_path = public, pg_temp;
alter function public.recycler_tous_les_doublons() set search_path = public, pg_temp;
alter function public.supprimer_mon_compte() set search_path = public, pg_temp;
alter function prive.nouveau_joueur() set search_path = public, pg_temp;

-- Droits d'exécution : rien pour les visiteurs, la liste exacte pour les joueurs connectés
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.mon_etat(), public.definir_pseudo(text), public.ouvrir_booster(text, boolean),
  public.recycler_doublons(text), public.recycler_tous_les_doublons(), public.debuter_duel(int),
  public.terminer_duel(uuid, text, int, int), public.maj_preferences(jsonb), public.supprimer_mon_compte()
to authenticated;
