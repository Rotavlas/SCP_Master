-- SCP Masters : correctifs des duels entre joueurs, relevés au contrôle général.

-- 0. Les visiteurs non connectés n'ont rien à lire dans ces tables. Les règles RLS ne leur renvoyaient déjà
--    aucune ligne ; on retire aussi le droit de lecture, comme pour les tables ajoutées depuis.
revoke select on public.profils, public.exemplaires, public.mouvements_credits from anon;

-- 0 bis. Supprimer son compte : ses anciens messages restent lisibles des destinataires, mais signés
--        « Agent disparu » (le pseudo est effacé avec le compte).
create or replace function public.supprimer_mon_compte() returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  perform prive.quitter_marche(moi);
  perform prive.quitter_clan(moi);
  update public.messages set pseudo = 'Agent disparu' where auteur = moi;
  delete from auth.users where id = moi;
  return true;
end $$;

-- 1. Un agent qui ferme son onglet reste moins longtemps dans la file : 15 secondes au lieu de 30
--    (le jeu se représente toutes les 4 secondes), pour ne pas être apparié à un absent.
create or replace function prive.nettoyer_jcj() returns void
language plpgsql volatile as $$
begin
  update public.duels_jcj set statut = 'annule', maj_le = now()
   where (statut = 'invitation' and cree_le < now() - interval '1 minute')
      or (statut in ('preparation', 'en_cours') and maj_le < now() - interval '3 minutes');
  delete from prive.file_jcj where vu_le < now() - interval '15 seconds';
end $$;

-- 2. Accepter un défi alors que l'un des deux est déjà en duel (apparié entre-temps dans la file) : refusé,
--    pour qu'un agent ne joue jamais deux duels à la fois. L'invitation expire ensuite d'elle-même.
create or replace function public.jcj_repondre_defi(p_joueur uuid, p_duel uuid, p_accepter boolean) returns jsonb
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
  if exists (select 1 from public.duels_jcj x
             where x.id <> p_duel and x.statut in ('preparation', 'en_cours')
               and (d.joueur_a in (x.joueur_a, x.joueur_b) or d.joueur_b in (x.joueur_a, x.joueur_b))) then
    raise exception 'L''un de vous deux est déjà en duel';
  end if;
  -- Les deux agents quittent la file d'attente classée
  delete from prive.file_jcj where joueur in (d.joueur_a, d.joueur_b);
  return jsonb_build_object('preparer', prive.preparer_jcj(p_duel));
end $$;
