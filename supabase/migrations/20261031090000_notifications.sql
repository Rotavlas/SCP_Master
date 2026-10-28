-- SCP Masters : notifications de la cloche (marché, enchères, échanges, cartes souhaitées mises en vente).
-- Des déclencheurs sur les tables du marché les écrivent : les fonctions du marché ne changent pas.
-- Le navigateur lit ses propres notifications en direct (Realtime, RLS) et les marque lues par une fonction.

create table public.notifications (
  id bigserial primary key,
  joueur uuid not null references public.profils on delete cascade,
  -- souhait_en_vente, surencheri, enchere_gagnee, vente_conclue, vente_invendue,
  -- echange_recu, echange_accepte, echange_refuse
  type text not null,
  donnees jsonb not null default '{}',
  lu boolean not null default false,
  cree_le timestamptz not null default now()
);
create index notifications_joueur on public.notifications (joueur, cree_le desc);

alter table public.notifications enable row level security;
create policy "ses notifications" on public.notifications for select to authenticated using (joueur = auth.uid());
grant select on public.notifications to authenticated;

-- Écrit une notification ; un joueur garde ses 100 dernières
create function prive.notifier(p_joueur uuid, p_type text, p_donnees jsonb) returns void
language plpgsql volatile as $$
begin
  if p_joueur is null then
    return;
  end if;
  insert into public.notifications (joueur, type, donnees) values (p_joueur, p_type, p_donnees);
  delete from public.notifications where joueur = p_joueur and id not in (
    select id from public.notifications where joueur = p_joueur order by id desc limit 100);
end $$;

create function prive.pseudo(p_joueur uuid) returns text
language sql stable as $$ select pseudo from public.profils where id = p_joueur $$;

-- ---------------------------------------------------------------------------
-- Enchères : carte souhaitée mise en vente, surenchère, fin de vente
-- ---------------------------------------------------------------------------
create function prive.notifier_enchere() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  d jsonb := jsonb_build_object('carte', new.carte_id, 'variante', new.variante, 'enchere', new.id);
  souhaitant uuid;
begin
  if tg_op = 'INSERT' then
    for souhaitant in select id from public.profils where new.carte_id = any (souhaits) and id <> new.vendeur loop
      perform prive.notifier(souhaitant, 'souhait_en_vente', d || jsonb_build_object('prix', new.prix_depart));
    end loop;
    return new;
  end if;
  -- Un autre enchérisseur passe devant (pas quand une mise est effacée)
  if new.encherisseur is distinct from old.encherisseur and old.encherisseur is not null and new.encherisseur is not null
     and new.statut = 'ouverte' then
    perform prive.notifier(old.encherisseur, 'surencheri', d || jsonb_build_object('mise', new.mise, 'par', prive.pseudo(new.encherisseur)));
  end if;
  if old.statut = 'ouverte' and new.statut = 'vendue' then
    perform prive.notifier(new.vendeur, 'vente_conclue', d || jsonb_build_object('prix', new.mise, 'acheteur', prive.pseudo(new.encherisseur)));
    perform prive.notifier(new.encherisseur, 'enchere_gagnee', d || jsonb_build_object('prix', new.mise, 'vendeur', prive.pseudo(new.vendeur)));
  elsif old.statut = 'ouverte' and new.statut = 'invendue' then
    perform prive.notifier(new.vendeur, 'vente_invendue', d);
  end if;
  return new;
end $$;

create trigger encheres_notifications after insert or update on public.encheres
  for each row execute function prive.notifier_enchere();

-- ---------------------------------------------------------------------------
-- Échanges : offre reçue, acceptée, refusée
-- ---------------------------------------------------------------------------
create function prive.notifier_offre() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform prive.notifier(new.a, 'echange_recu', jsonb_build_object('offre', new.id, 'de', prive.pseudo(new.de)));
  elsif old.statut = 'ouverte' and new.statut in ('acceptee', 'refusee') then
    perform prive.notifier(new.de, case new.statut when 'acceptee' then 'echange_accepte' else 'echange_refuse' end,
      jsonb_build_object('offre', new.id, 'avec', prive.pseudo(new.a)));
  end if;
  return new;
end $$;

create trigger offres_notifications after insert or update on public.offres
  for each row execute function prive.notifier_offre();

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le jeu
-- ---------------------------------------------------------------------------
create function public.mes_notifications() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'liste', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'donnees', n.donnees, 'lu', n.lu, 'le', n.cree_le)
                                         order by n.id desc)
                       from (select * from public.notifications where joueur = prive.joueur() order by id desc limit 50) n), '[]'::jsonb),
    'nonLues', (select count(*) from public.notifications where joueur = prive.joueur() and not lu));
$$;

create function public.lire_notifications() returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  update public.notifications set lu = true where joueur = prive.joueur() and not lu;
$$;

revoke execute on function public.mes_notifications(), public.lire_notifications() from public, anon;
grant execute on function public.mes_notifications(), public.lire_notifications() to authenticated;

-- Diffusion en direct des nouvelles notifications
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then
  raise notice 'Direct des notifications non activé : %', sqlerrm;
end $$;
