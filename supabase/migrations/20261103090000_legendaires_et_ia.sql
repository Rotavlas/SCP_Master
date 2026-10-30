-- SCP Masters : une Légendaire plus rare (0,2 % par carte dans un dossier standard au lieu de 0,7 %, les dossiers
-- Keter et O5 baissés dans la même proportion) et 5 duels récompensés par jour contre l'IA au lieu de 10.
-- Constantes à garder synchronisées avec src/engine/boosters.ts et src/components/Duel.tsx.
-- À exécuter dans le SQL Editor de Supabase.

-- ---------------------------------------------------------------------------
-- 1. Raretés des dossiers : [commune, peu commune, rare, épique, légendaire]
-- ---------------------------------------------------------------------------
update prive.types_boosters set poids = '{0.6636,0.24,0.075,0.02,0.0014}', poids_derniere = '{0,0.7105,0.22,0.065,0.0045}'
where id in ('standard', 'scp', 'contes', 'personnel');
update prive.types_boosters set poids = '{0,0.6907,0.24,0.065,0.0043}', poids_derniere = '{0,0,0.7629,0.22,0.0171}' where id = 'keter';
update prive.types_boosters set poids = '{0,0,0.7629,0.22,0.0171}', poids_derniere = '{0,0,0,0.9429,0.0571}' where id = 'o5';

-- ---------------------------------------------------------------------------
-- 2. Duels contre l'IA : 5 duels récompensés par 24 heures
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
  if du_jour >= 5 then
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

create or replace function public.tableau_duels() returns jsonb
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
    'iaRestants', greatest(0, 5 - (select count(*) from prive.duels_ia
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
