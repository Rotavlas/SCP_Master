-- SCP Masters : duels contre l'IA arbitrés par le serveur.
-- La fonction Edge « duel » (supabase/functions/duel) tire le deck de l'IA, pose les questions sans
-- jamais envoyer la bonne réponse avant qu'on ait répondu, chronomètre, fait répondre l'IA et calcule
-- les dégâts. L'état de la partie vit ici, dans le schéma privé. Les fonctions ci-dessous ne sont
-- appelables qu'avec la clé de service, donc uniquement par la fonction Edge.

alter table prive.duels_ia add column etat jsonb, add column version int not null default 0;

-- Le navigateur annonçait lui-même l'issue et le nombre de bonnes réponses : ces fonctions disparaissent
drop function if exists public.debuter_duel(int);
drop function if exists public.terminer_duel(uuid, text, int, int);

-- Ouvre un duel : contrôle l'accréditation et l'équipe, abandonne le duel précédent resté ouvert
create function public.duel_preparer(p_joueur uuid, p_niveau int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  p public.profils;
  a prive.adversaires;
  id_duel uuid;
begin
  select * into p from public.profils where id = p_joueur for update;
  if not found then
    raise exception 'Joueur inconnu';
  end if;
  select * into a from prive.adversaires where niveau = p_niveau;
  if not found then
    raise exception 'Adversaire inconnu';
  end if;
  if a.accreditation > prive.accreditation(p.xp) then
    raise exception 'Accréditation insuffisante';
  end if;
  if cardinality(p.equipe) <> 5 or (select count(distinct e) from unnest(p.equipe) e) <> 5 or exists (
    select 1 from unnest(p.equipe) e
    where not exists (select 1 from public.exemplaires x where x.proprietaire = p_joueur and x.carte_id = e)) then
    raise exception 'Il faut une équipe de 5 cartes possédées';
  end if;
  update prive.duels_ia set fin = now(), issue = 'defaite', bonnes = 0, credits = 0, xp = 0
   where joueur = p_joueur and fin is null;
  insert into prive.duels_ia (joueur, niveau) values (p_joueur, p_niveau) returning id into id_duel;
  return jsonb_build_object('id', id_duel, 'equipe', to_jsonb(p.equipe), 'langue', p.langue);
end $$;

-- État d'un duel en cours de ce joueur, avec sa version (pour refuser deux écritures croisées)
create function public.duel_lire(p_duel uuid, p_joueur uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('etat', etat, 'version', version)
  from prive.duels_ia where id = p_duel and joueur = p_joueur and fin is null;
$$;

create function public.duel_ecrire(p_duel uuid, p_joueur uuid, p_version int, p_etat jsonb) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update prive.duels_ia set etat = p_etat, version = version + 1
   where id = p_duel and joueur = p_joueur and fin is null and version = p_version;
  return found;
end $$;

-- Clôt le duel et verse la récompense, calculée ici à partir de l'issue établie par le serveur
create function public.duel_clore(p_duel uuid, p_joueur uuid, p_version int, p_etat jsonb, p_issue text, p_bonnes int, p_questions int)
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
  if du_jour >= 30 then
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

-- Réservées à la fonction Edge (clé de service) : ni les visiteurs ni les joueurs ne peuvent les appeler
revoke execute on function
  public.duel_preparer(uuid, int), public.duel_lire(uuid, uuid), public.duel_ecrire(uuid, uuid, int, jsonb),
  public.duel_clore(uuid, uuid, int, jsonb, text, int, int)
from public, anon, authenticated;
grant execute on function
  public.duel_preparer(uuid, int), public.duel_lire(uuid, uuid), public.duel_ecrire(uuid, uuid, int, jsonb),
  public.duel_clore(uuid, uuid, int, jsonb, text, int, int)
to service_role;
