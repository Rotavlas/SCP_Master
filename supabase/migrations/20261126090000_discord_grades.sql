-- SCP Masters : le Discord de la communauté relié au jeu.
--  1. Le compte Discord d'un agent : celui de sa connexion Discord, ou celui qu'il a lié depuis Mon agent
--     (auth.identities, fournisseur « discord »).
--  2. Son grade Discord suit son niveau d'accréditation (0 à 5) : la fonction Edge le pose avec le bot, et retient ici
--     le dernier grade posé (profils.discord_grade) pour ne le refaire qu'au changement de niveau.
--  3. Les commandes /profil et /podium du bot lisent ici (réservé à la fonction Edge, clé de service).
-- À exécuter dans le SQL Editor de Supabase, après 20261125090000_tirages_discord.sql.

alter table public.profils add column if not exists discord_grade smallint;

-- L'identifiant Discord d'un agent (nul s'il n'a pas de compte Discord relié)
create or replace function prive.discord_id(p_joueur uuid) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  id text;
begin
  if to_regclass('auth.identities') is null then
    return null;
  end if;
  execute 'select provider_id from auth.identities where user_id = $1 and provider = ''discord'' order by created_at limit 1'
    into id using p_joueur;
  return id;
end $$;

-- Pour l'agent : son compte Discord est-il relié, quel grade a été posé, quel est son niveau
create or replace function public.mon_discord() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('lie', prive.discord_id(p.id) is not null, 'grade', p.discord_grade, 'niveau', prive.accreditation(p.xp))
    from public.profils p where p.id = prive.joueur();
$$;

-- ---------------------------------------------------------------------------
-- Réservé à la fonction Edge (clé de service)
-- ---------------------------------------------------------------------------
create or replace function public.discord_infos(p_joueur uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('discord_id', prive.discord_id(p.id), 'niveau', prive.accreditation(p.xp), 'pseudo', p.pseudo)
    from public.profils p where p.id = p_joueur;
$$;

create or replace function public.discord_grade_enregistre(p_joueur uuid, p_grade int) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.profils set discord_grade = p_grade where id = p_joueur;
$$;

create or replace function public.discord_est_createur(p_joueur uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from prive.badges_speciaux where joueur = p_joueur and badge = 'createur');
$$;

-- /profil : ce que tout le monde peut voir d'un agent
create or replace function public.discord_profil(p_pseudo text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
      'pseudo', p.pseudo,
      'xp', p.xp,
      'niveau', prive.accreditation(p.xp),
      'elo', p.elo,
      'jcj', p.jcj,
      'fiches', (select count(distinct carte_id) from public.exemplaires e where e.proprietaire = p.id),
      'mythiques', (select count(distinct e.carte_id) from public.exemplaires e join public.cartes c on c.id = e.carte_id
                     where e.proprietaire = p.id and c.ra = 5),
      'clan', (select jsonb_build_object('nom', c.nom, 'tag', c.tag) from prive.membres_clan m join prive.clans c on c.id = m.clan
                where m.joueur = p.id),
      'depuis', p.cree_le)
    from public.profils p
   where p.pseudo is not null and lower(p.pseudo) = lower(trim(p_pseudo));
$$;

-- /podium : la dernière Épreuve close et le haut du classement Elo
create or replace function public.discord_podium() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'epreuve', (
      select jsonb_build_object('semaine', s.semaine, 'podium', coalesce((
        select jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'score', r.score, 'rang', r.rang) order by r.rang)
          from public.epreuves_resultats r join public.profils p on p.id = r.joueur
         where r.semaine = s.semaine and r.rang <= 3), '[]'::jsonb))
        from (select max(semaine) as semaine from public.epreuves_resultats) s where s.semaine is not null),
    'elo', coalesce((
      select jsonb_agg(jsonb_build_object('pseudo', x.pseudo, 'elo', x.elo) order by x.elo desc)
        from (select pseudo, elo from public.profils where pseudo is not null order by elo desc limit 3) x), '[]'::jsonb));
$$;

revoke execute on function prive.discord_id(uuid) from public;
revoke execute on function public.mon_discord() from public, anon;
grant execute on function public.mon_discord() to authenticated;
revoke execute on function
  public.discord_infos(uuid), public.discord_grade_enregistre(uuid, int), public.discord_est_createur(uuid),
  public.discord_profil(text), public.discord_podium()
from public, anon, authenticated;
grant execute on function
  public.discord_infos(uuid), public.discord_grade_enregistre(uuid, int), public.discord_est_createur(uuid),
  public.discord_profil(text), public.discord_podium()
to service_role;
