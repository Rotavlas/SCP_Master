-- SCP Masters : historique des mises de chaque enchère, avec le pseudo de l'enchérisseur,
-- et pseudo du meneur dans la liste des ventes en cours.

-- Les 50 dernières mises d'une enchère, de la plus récente à la plus ancienne
create function public.historique_mises(p_enchere uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('pseudo', coalesce(p.pseudo, 'Agent disparu'), 'montant', m.montant, 'le', m.le, 'moi', m.joueur = moi)
                     order by m.le desc, m.id desc)
    from (select * from prive.mises where enchere = p_enchere order by le desc, id desc limit 50) m
    left join public.profils p on p.id = m.joueur), '[]'::jsonb);
end $$;

-- La liste des ventes en cours indique qui mène
create or replace function public.marche() returns jsonb
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
        'fin', e.fin, 'vendeur', v.pseudo, 'meneur', m.pseudo, 'aMoi', e.vendeur = moi, 'enTete', e.encherisseur = moi) order by e.fin)
      from public.encheres e
      join public.profils v on v.id = e.vendeur
      left join public.profils m on m.id = e.encherisseur
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

revoke execute on function public.historique_mises(uuid), public.marche() from public, anon;
grant execute on function public.historique_mises(uuid), public.marche() to authenticated;
