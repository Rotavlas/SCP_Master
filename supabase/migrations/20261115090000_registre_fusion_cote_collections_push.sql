-- SCP Masters : registre des Mythiques, fusion, cote du marché, collections des Groupes d'intérêt, cosmétiques et
-- notifications sur l'appareil.
--  1. Registre de provenance : chaque exemplaire numéroté d'une Mythique garde la liste de ses détenteurs successifs
--     (tirée d'un dossier, gagnée aux enchères avec son prix, échangée, détruite). Un déclencheur sur les exemplaires
--     l'écrit : les fonctions du marché et des dossiers ne changent pas.
--  2. Fusion : 5 doublons standard d'une carte (en plus de l'exemplaire gardé) deviennent 1 exemplaire dans une variante
--     tirée au hasard (plus elle est rare, moins elle sort). Frais : la valeur de brûlage des 5 doublons. 3 par jour.
--     Jamais pour une Mythique. La fusion retire 4 cartes du jeu à chaque fois.
--  3. Cote du marché : volume de la semaine, plus fortes hausses et baisses, cartes les plus échangées, records.
--  4. Collections des Groupes d'intérêt : la carte du Groupe et tous ses documents. Une collection complète se réclame
--     contre un titre et un cadre de profil, jamais contre des crédits.
--  5. Cosmétiques achetables : titres, cadres de profil, couvertures de dossier. Les prix se règlent dans
--     prive.cosmetiques (SQL Editor) sans toucher au code.
--  6. Notifications sur l'appareil (Web Push) : les notifications de la cloche et les messages privés partent vers les
--     téléphones abonnés. Une file d'attente, vidée chaque minute par la fonction Edge « duel » (action « push »),
--     appelée par pg_cron et pg_net seulement quand la file n'est pas vide.
-- À exécuter dans le SQL Editor de Supabase, après 20261114090000_variantes_mythiques.sql.

-- ---------------------------------------------------------------------------
-- 0. Deux nouvelles origines d'exemplaire : la fusion
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as t, conname
      from pg_constraint
     where contype = 'c' and conrelid = 'public.exemplaires'::regclass
       and pg_get_constraintdef(oid) like '%origine%' and pg_get_constraintdef(oid) not like '%fusion%'
  loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
    execute format('alter table %s add constraint %I check (origine in (%s))', c.t, c.conname,
                   (select string_agg(quote_literal(v), ', ')
                      from unnest(array['booster', 'souvenir', 'recompense', 'echange', 'enchere', 'bourse', 'fusion']) v));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Registre de provenance des Mythiques
-- ---------------------------------------------------------------------------
create table if not exists prive.provenance (
  id bigserial primary key,
  exemplaire uuid not null,
  carte_id text not null,
  variante text not null,
  numero int not null,
  -- Sans clé étrangère : le registre survit à la suppression d'un compte
  joueur uuid,
  pseudo text,
  -- tire, enchere, echange, recompense, fusion, autre ; brule (détruit) ; perdu (parti avec son agent)
  evenement text not null,
  prix bigint,
  le timestamptz not null default now()
);
create index if not exists provenance_carte on prive.provenance (carte_id, exemplaire, le);
alter table prive.provenance enable row level security;

create or replace function prive.tracer_provenance() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prix bigint;
begin
  if tg_op = 'DELETE' then
    if old.numero_serie is null or not exists (select 1 from public.cartes where id = old.carte_id and ra = 5) then
      return null;
    end if;
    insert into prive.provenance (exemplaire, carte_id, variante, numero, joueur, pseudo, evenement)
      values (old.id, old.carte_id, old.variante, old.numero_serie, old.proprietaire, prive.pseudo(old.proprietaire),
              -- Supprimé avec le compte de son agent (le profil a déjà disparu), ou détruit par son détenteur
              case when exists (select 1 from public.profils where id = old.proprietaire) then 'brule' else 'perdu' end);
    return null;
  end if;
  if new.numero_serie is null or (tg_op = 'UPDATE' and new.proprietaire = old.proprietaire)
     or not exists (select 1 from public.cartes where id = new.carte_id and ra = 5) then
    return null;
  end if;
  -- Gagnée aux enchères : l'enchère est encore ouverte au moment du transfert, sa mise est le prix payé
  if tg_op = 'UPDATE' and new.origine = 'enchere' then
    select e.mise into prix from public.encheres e where e.exemplaire = new.id and e.statut = 'ouverte' order by e.debut desc limit 1;
  end if;
  insert into prive.provenance (exemplaire, carte_id, variante, numero, joueur, pseudo, evenement, prix)
    values (new.id, new.carte_id, new.variante, new.numero_serie, new.proprietaire, prive.pseudo(new.proprietaire),
            case
              when tg_op = 'INSERT' then case new.origine when 'booster' then 'tire' when 'fusion' then 'fusion' else 'recompense' end
              else case new.origine when 'enchere' then 'enchere' when 'echange' then 'echange' else 'autre' end
            end, prix);
  return null;
end $$;

drop trigger if exists exemplaires_provenance on public.exemplaires;
create trigger exemplaires_provenance after insert or delete or update of proprietaire on public.exemplaires
  for each row execute function prive.tracer_provenance();

-- Les Mythiques déjà sorties entrent au registre avec leur détenteur actuel
insert into prive.provenance (exemplaire, carte_id, variante, numero, joueur, pseudo, evenement, le)
  select x.id, x.carte_id, x.variante, x.numero_serie, x.proprietaire, p.pseudo,
         case x.origine when 'booster' then 'tire' when 'enchere' then 'enchere' when 'echange' then 'echange' else 'recompense' end,
         x.obtenu_le
    from public.exemplaires x join public.cartes c on c.id = x.carte_id join public.profils p on p.id = x.proprietaire
   where c.ra = 5 and x.numero_serie is not null
     and not exists (select 1 from prive.provenance v where v.exemplaire = x.id);

-- Le registre d'une Mythique : chaque exemplaire sorti, son détenteur actuel et son histoire
create or replace function public.registre_mythique(p_carte text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'numero', n.numero,
      'variante', n.variante,
      'detenteur', (select p.pseudo from public.exemplaires x join public.profils p on p.id = x.proprietaire where x.id = n.exemplaire),
      'moi', exists (select 1 from public.exemplaires x where x.id = n.exemplaire and x.proprietaire = prive.joueur()),
      'historique', (select jsonb_agg(jsonb_build_object('pseudo', h.pseudo, 'evenement', h.evenement, 'prix', h.prix, 'le', h.le)
                                      order by h.le, h.id)
                       from prive.provenance h where h.exemplaire = n.exemplaire))
    order by n.numero), '[]'::jsonb)
  from (select distinct on (v.exemplaire) v.exemplaire, v.numero, v.variante
          from prive.provenance v
         where v.carte_id = p_carte and exists (select 1 from public.cartes c where c.id = p_carte and c.ra = 5)
         order by v.exemplaire, v.le desc) n;
$$;

-- ---------------------------------------------------------------------------
-- 2. Fusion de 5 doublons en une variante
-- ---------------------------------------------------------------------------
create table if not exists prive.fusions (
  id bigserial primary key,
  joueur uuid not null references public.profils on delete cascade,
  carte_id text not null,
  variante text not null,
  le timestamptz not null default now()
);
create index if not exists fusions_joueur on prive.fusions (joueur, le desc);
alter table prive.fusions enable row level security;

-- Une variante ordinaire, au prorata des chances du tirage : Holographique la plupart du temps, Sceau O5 presque jamais
create or replace function prive.tirer_variante_fusion() returns text
language plpgsql volatile as $$
declare
  x float8 := random() * (select sum(chance) from prive.variantes);
  v record;
begin
  for v in select id, chance from prive.variantes order by chance loop
    x := x - v.chance;
    if x < 0 then
      return v.id;
    end if;
  end loop;
  return 'holo';
end $$;

create or replace function prive.fusions_restantes(p_joueur uuid) returns int
language sql stable as $$
  select greatest(0, 3 - count(*)::int) from prive.fusions where joueur = p_joueur and le >= prive.debut_du_jour();
$$;

create or replace function public.fusions_restantes() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select prive.fusions_restantes(prive.joueur());
$$;

create or replace function public.fusionner(p_carte text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  rarete int;
  total int;
  libres int;
  frais bigint;
  obtenue text;
  numero int;
begin
  perform 1 from public.profils where id = moi for update;
  select ra into rarete from public.cartes where id = p_carte;
  if rarete is null then
    raise exception 'Carte inconnue';
  end if;
  if rarete = 5 then
    raise exception 'Une Mythique ne se fusionne pas : chacun de ses exemplaires est numéroté';
  end if;
  if prive.fusions_restantes(moi) <= 0 then
    raise exception 'Trois fusions par jour au plus : la prochaine sera possible à minuit';
  end if;
  -- On garde toujours un exemplaire standard, comme pour le recyclage
  select count(*) filter (where variante = 'std'),
         count(*) filter (where variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir')
    into total, libres
    from public.exemplaires where proprietaire = moi and carte_id = p_carte;
  if least(libres, total - 1) < 5 then
    raise exception 'Il faut 5 doublons libres de cette carte, en plus de l''exemplaire gardé (ni en vente, ni en échange)';
  end if;
  frais := 5 * prive.valeur_brulage(rarete, 'std');
  if (select credits from public.profils where id = moi) < frais then
    raise exception 'Crédits insuffisants : la fusion coûte % ₵', frais;
  end if;
  delete from public.exemplaires where id in (
    select id from public.exemplaires
     where proprietaire = moi and carte_id = p_carte and variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir'
     order by numero_serie desc nulls last, obtenu_le desc
     limit 5);
  perform prive.crediter(moi, -frais, 'fusion', p_carte);
  obtenue := prive.tirer_variante_fusion();
  numero := prive.prochain_numero(p_carte, obtenue);
  insert into public.exemplaires (proprietaire, carte_id, variante, numero_serie, origine) values (moi, p_carte, obtenue, numero, 'fusion');
  insert into prive.fusions (joueur, carte_id, variante) values (moi, p_carte, obtenue);
  return jsonb_build_object('variante', obtenue, 'numero', numero, 'frais', frais,
                            'restantes', prive.fusions_restantes(moi), 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 3. La cote du marché
-- ---------------------------------------------------------------------------
create index if not exists ventes_le on public.ventes (le desc);

create or replace function public.cote_marche() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with v30 as (
    select carte_id, variante, prix, le from public.ventes where le >= now() - interval '30 days'
  ),
  recent as (
    select carte_id, variante, (percentile_cont(0.5) within group (order by prix))::bigint as med, count(*)::int as n
      from v30 where le >= now() - interval '7 days' group by carte_id, variante
  ),
  ancien as (
    select carte_id, variante, (percentile_cont(0.5) within group (order by prix))::bigint as med, count(*)::int as n
      from v30 where le < now() - interval '7 days' group by carte_id, variante
  ),
  evolution as (
    select r.carte_id, r.variante, r.med as prix, a.med as avant, r.n,
           round((r.med::numeric / a.med - 1) * 100)::int as pct
      from recent r join ancien a using (carte_id, variante)
     where r.n >= 2 and a.n >= 2 and a.med > 0
  )
  select jsonb_build_object(
    'ventes7', (select count(*) from v30 where le >= now() - interval '7 days'),
    'credits7', (select coalesce(sum(prix), 0) from v30 where le >= now() - interval '7 days'),
    'ventesAvant', (select count(*) from v30 where le >= now() - interval '14 days' and le < now() - interval '7 days'),
    'creditsAvant', (select coalesce(sum(prix), 0) from v30 where le >= now() - interval '14 days' and le < now() - interval '7 days'),
    'hausses', (select coalesce(jsonb_agg(jsonb_build_object('carte', carte_id, 'variante', variante, 'prix', prix, 'avant', avant, 'pct', pct)
                                          order by pct desc), '[]'::jsonb)
                  from (select * from evolution where pct > 0 order by pct desc limit 6) x),
    'baisses', (select coalesce(jsonb_agg(jsonb_build_object('carte', carte_id, 'variante', variante, 'prix', prix, 'avant', avant, 'pct', pct)
                                          order by pct), '[]'::jsonb)
                  from (select * from evolution where pct < 0 order by pct limit 6) x),
    'echangees', (select coalesce(jsonb_agg(jsonb_build_object('carte', carte_id, 'variante', variante, 'ventes', n, 'prix', med)
                                            order by n desc, med desc), '[]'::jsonb)
                    from (select * from recent order by n desc, med desc limit 6) x),
    'records', (select coalesce(jsonb_agg(jsonb_build_object('carte', carte_id, 'variante', variante, 'prix', prix, 'le', le)
                                          order by prix desc), '[]'::jsonb)
                  from (select * from v30 order by prix desc limit 6) x));
$$;

-- ---------------------------------------------------------------------------
-- 4 et 5. Cosmétiques et collections des Groupes d'intérêt
-- ---------------------------------------------------------------------------
-- Les noms et les dessins sont dans src/data/cosmetiques.ts ; ici, le type et le prix (vide : ne s'achète pas, il se
-- gagne en complétant une collection). Pour changer un prix : update prive.cosmetiques set prix = … where id = '…'
create table if not exists prive.cosmetiques (
  id text primary key,
  type text not null check (type in ('titre', 'cadre', 'couverture')),
  prix int check (prix is null or prix > 0),
  ordre int not null default 0
);
alter table prive.cosmetiques enable row level security;

insert into prive.cosmetiques (id, type, prix, ordre) values
  ('titre-agent-terrain', 'titre', 1500, 1),
  ('titre-chercheur', 'titre', 3000, 2),
  ('titre-archiviste-chef', 'titre', 6000, 3),
  ('titre-superviseur', 'titre', 12000, 4),
  ('titre-directeur', 'titre', 25000, 5),
  ('titre-eminence', 'titre', 60000, 6),
  ('cadre-acier', 'cadre', 5000, 1),
  ('cadre-laiton', 'cadre', 10000, 2),
  ('cadre-confinement', 'cadre', 20000, 3),
  ('cadre-sceau-or', 'cadre', 50000, 4),
  ('couv-quadrille', 'couverture', 5000, 1),
  ('couv-ruban-keter', 'couverture', 8000, 2),
  ('couv-marbre', 'couverture', 15000, 3),
  ('couv-dorure-o5', 'couverture', 40000, 4)
on conflict (id) do update set type = excluded.type, prix = excluded.prix, ordre = excluded.ordre;

create table if not exists prive.cosmetiques_possedes (
  joueur uuid not null references public.profils on delete cascade,
  cosmetique text not null references prive.cosmetiques on delete cascade,
  le timestamptz not null default now(),
  primary key (joueur, cosmetique)
);
alter table prive.cosmetiques_possedes enable row level security;

-- Les cosmétiques portés : {"titre": "…", "cadre": "…", "couverture": "…"}
alter table public.profils add column if not exists cosmetiques jsonb not null default '{}';

create table if not exists prive.collections (
  id text primary key,
  titre text not null,
  ordre int not null default 0
);
alter table prive.collections enable row level security;

create table if not exists prive.collections_cartes (
  collection text not null references prive.collections on delete cascade,
  carte_id text not null,
  primary key (collection, carte_id)
);
alter table prive.collections_cartes enable row level security;

create table if not exists prive.collections_reclamees (
  joueur uuid not null references public.profils on delete cascade,
  collection text not null,
  le timestamptz not null default now(),
  primary key (joueur, collection)
);
alter table prive.collections_reclamees enable row level security;

-- Chaque collection : la carte du Groupe d'intérêt et tous ses documents (liste tirée du catalogue des cartes)
insert into prive.collections (id, titre, ordre) values
  ('main-du-serpent', 'La Main du Serpent', 1),
  ('wilson', 'Wilson’s Wildlife Solutions', 2),
  ('awcy', 'Are We Cool Yet?', 3),
  ('spc', 'Le Centre de boxe anti-requins', 4),
  ('mcd', 'Marshall, Carter & Dark', 5),
  ('uiu', 'L’Unité des incidents inhabituels', 6),
  ('com', 'La Coalition occulte mondiale', 7),
  ('reine-noire', 'La Reine Noire', 8),
  ('cirque', 'Le Cirque de l’inquiétant d’Herman Fuller', 9),
  ('insurrection', 'L’Insurrection du Chaos', 10),
  ('prometheus', 'Prometheus Labs', 11),
  ('dieu-brise', 'L’Église du Dieu Brisé', 12)
on conflict (id) do update set titre = excluded.titre, ordre = excluded.ordre;

-- Leurs récompenses : un titre et un cadre propres au Groupe, qui ne s'achètent pas
insert into prive.cosmetiques (id, type, prix, ordre)
  select 'titre-' || id, 'titre', null::int, 100 + ordre from prive.collections
  union all
  select 'cadre-' || id, 'cadre', null::int, 100 + ordre from prive.collections
on conflict (id) do update set type = excluded.type, prix = excluded.prix, ordre = excluded.ordre;

delete from prive.collections_cartes;
insert into prive.collections_cartes (collection, carte_id)
  select l.collection, unnest(l.cartes)
    from (values
  ('main-du-serpent', array['gdi:the-serpent-s-hand','scattersomnia','a-dreaming-giant-s-chair','a-love-letter-to-a-lady-mantis','a-new-age-of-magic','a-quiet-night','a-sympathetic-thorn-in-the-side-of-the-bookburners','a-wedding-gift-for-a-lady-mantis','alchemical-familiars','artificial-dragons-gate','blue-lily-chains','clown-town','dreamlandiwate','ero-vahk','favoured-son','flying-whales','general-hatter','general-lani-colu','general-moloch','general-qual','grabnok-the-destroyer','hello-i-am-an-eldritch-horror','his-mighty-snailordship','how-to-adopt-a-butterfly-koi','how-to-make-a-focus-of-ultimate-power-a-guide','independent-republic-of-silesia','mother-who-demands-ones-toes','koi-format','lady-yoru','lord-goran','lord-jeser','lord-kenkgor','lord-shash','marw-el-reencarnado','mr-doggo','new-atlantis','normal-towns','operation-berberoka-after-action-report','pegasus','plaunedas','publin','rock-war-rock-war','the-eschaton','shiloh-a-wrun','spirit-staff-of-eastern-avian-shaman','summer-s-exile','the-amazonian-hind','the-black-vaults-of-alagadda','the-choir-below','the-conspiracy-of-sigma-3','the-deathless-merchant-of-london','the-deniers','the-emperor-of-many-voices','the-gallows-tree','gardeners-of-the-orchard','the-golem-of-prague','the-great-shucks-of-the-unnamed-lords','the-grove-of-exiles','the-hydra-s-spine','the-immortal-empire','the-ironclad-fae','the-kaiju-sea','the-lord-of-endowments','the-mekhanical-maiden','gumiho','parliament-of-monsters','the-queens-butterfly','the-reassembled-one','the-sacred-djehuti','the-second-child','the-slumbering-prince','of-the-great-searing','surface-to-air-bamboo','truth-glamour','vassago']),
  ('wilson', array['gdi:wilson-s-wildlife-solutions','adoption-poster-bandit','adoption-poster-bonzo','adoption-poster-cupid','adoption-poster-darius','adoption-poster-friday','adoption-poster-hx','adoption-poster-lloyd','adoption-poster-ol-shock','adoption-poster-pearl','adoption-poster-phoebe','critter-profile-arorangi','critter-profile-bakugo','critter-profile-bartholomew','critter-profile-big-blue','critter-profile-bo-and-her-friends','critter-profile-cack-dealer','critter-profile-caddy','critter-profile-cappi','critter-profile-chel','critter-profile-chuck','critter-profile-clara','critter-profile-constantine','critter-profile-corey','critter-profile-davy-bones','critter-profile-diomedes','critter-profile-dormi','critter-profile-francis','critter-profile-gabby','critter-profile-geist','critter-profile-genghis','critter-profile-jerry','profil-zwierzaka-kijetesantakalu','critter-profile-lintbugs','critter-profile-max','critter-profile-maya','critter-profile-midas','critter-profile-miss-cassandra','critter-profile-moonstone','critter-profile-neil','critter-profile-nuala','critterprofile-otis','critter-profile-portia','critter-profile-pothole','critter-profile-potoooooooo','critter-profile-reggie','ringo','critter-profile-sampson','critter-profile-sandra-and-george','critter-profile-slappy','critter-profile-sparky','critter-profile-stickky','critter-profile-swift','critter-profile-tangerine','critter-profile-teemo','critter-profile-the-polar-bear','critter-profile-thunder','critter-profile-tiramisu','tyler','critter-profile-vizzie','critter-profile-wobbles','critter-profile-yvette','critter-profile-zargoth','peligro-igniciervos','peligro-hipopotamos-de-medellin','danger-trunko']),
  ('awcy', array['gdi:are-we-cool-yet','a-million-pictures-of-the-ocean-song-of-the-gulls','nalkan-art-exhibit','ere-i-forget-or-die-or-move-away','erics-mega-zine-vol-49-an-intermission-to-keep-you-hanging','esterberg-city-wikipedia','hatuey','project-consonance','prisonerinyourskull','more-than-secret-lovers-1917','portal-to-venus','project-proposal-1964-238','project-proposal-1964-301','project-proposal-1990-60-a-tragedy-for-the-ages','project-proposal-1994-103','project-proposal-1994-357-a-still-life','project-proposal-1994-87-a-day-in-the-roman-court','project-proposal-2004-024','project-proposal-2004-481','project-proposal-2007-012','in-the-name-of-purity','project-proposal-2008-041','project-proposal-2012-120','projektvorschlag-2014-001','project-proposal-2021-017-son-of-man-son-of-god','project-proposal-2014-012','project-proposal-2014-027','project-proposal-2014-1221','project-proposal-2014-2112','project-proposal-2014-234','project-proposal-2014-733','project-proposal-2017-005-a-self-keeping-secret-a-removal-of','project-proposal-2018-019','project-proposal-2018-112','project-proposal-2018-145','roundatarles','proposition-de-projet-2019-319','project-proposal-2021-001','project-proposal-2021-298','proposition-de-projet-2023-011','projektvorschlag-2024-001','project-proposal-2024-124','mirror-to-america','project-proposal-2024-258','project-proposal-2024-476','project-proposal-2024-878-die-gedanken-sind-frei','echoes','project-proposals-1964-011-1974-014','project-proposal-2004-013-2014-114-2024-072','the-beauty','the-madness-sets-in-fast','artist-formerly-known-as-chuck','3portsplaysitself','groupofseventeen','untitled-2023','a-friendly-guide-to-the-katharsys-music-festival']),
  ('spc', array['gdi:shark-punching-center-spc','misterfrown-s-dumb-proposal','misterfrown-s-dumber-proposal','misterfrown-s-dumbest-proposal','peppersghosts-stupid-proposal','right-proposal','spc-000','spc-001-ex','spc-001-j','spc-002','spc-058','spc-105','spc-1258','spc-126-j','spc-140','spc-1545-and-a-half-j','spc-1548','spc-166','spc-169-j','spc-172-j','spc-173-j','spc-179','spc-1810','spc-1981','spc-2000','spc-2191','spc-2316','spc-2615','spc-2806','spc-2922','spc-2935-j','spc-2970','spc-3000','spc-3008','spc-3733','spc-377','spc-3787','spc-3871-j','spc-408','spc-446','spc-500','spc-507','spc-5306','spc-6500','spc-6556','spc-682','spc-6985','spc-7000','spc-720','spc-993','spc-cn-985','spc-es-125','nicos-stupid-proposal']),
  ('mcd', array['gdi:marshall-carter-and-dark-ltd','oliphant-airavata','a-second-chance-at-today','an-unforgettable-performance-9s15f-fmur9-ay1d9','mcd-art-by-oswaldo','best-rest-villa-myk7x-br05f-v9902','brian-brayer-brand-pocket-vacations','carter-courier-channel','delendases-f3b3r-x44nm-pll77','dream-daycare','mcd-fidget-winners','glitterstix-glr032-stx787-ref819','mcd-hadrians-well','high-interest-ledger','hypnotraline','imperfectly-fossilized-eggs-m4rho-edope-fo5le','iron-priest-aic-fep26-pr4y5-m3k43','kaiju-caviar-ocn39-t5fg6-7hjl2','lego-minithinkers-8y9d5-2x4h7-s89m2','mcd-little-draft-horses','nexus-hyperline','night-s-collection','osteotronic-cubes-vxy33-f7rq3-9xad1','para-puppies','perispirit-records-personal-concert-experience-dm437-25p16f','phoenix-a-la-mode','pulp-fanfiction','rogue-ai-nveo4-yvn3e-pn6ug','schulman-ny-programmable-mnestic-device-ac34d-nc77q-95dcs','mcd-smart-hex','somatic-backups','test-subjects','thalbrum-vehicle-security','the-crocosquid','the-dark-web-dke79-o2rg5-4jlw6','the-puppet','mcd-thunderbolt-iron','unicorn-horn','weissman-model-assistance-clones','xyreaux-schulman-extension-component-ac42e-nc77q-95dcw','mcd-bloodbaths','new-from-atf-the-door-to-another-world','two-transcribed-conversations-in-very-different-tones','casino-crimson-2','casino-crimson','chicago-lots','the-lizard-adapting-endlessly-6gjqg-jt8xh-wobu2','infinite-blood-fountains','mexico-city-niceties','robot-lounge','slumhouse','drzewa-wolnosci']),
  ('uiu', array['gdi:unusual-incidents-unit-uiu','cpia-files-a-015','make-america-normaler','irregularity-proposal-2001-489','thorne-v-united-states','uiu-file-2019-132','uiu-file-2020-289','uiu-file-1933-001','uiu-file-1941-016','uiu-file-1948-019','uiu-file-1952-003','uiu-file-1970-034','uiu-file-1972-055','uiu-file-1973-05','uiu-file-1988-021','uiu-file-1993-273','uiu-file-1997-007','uiu-file-1997-024','uiu-file-1998-017','uiu-file-2001-023','uiu-file-2001-745','uiu-file-2003-112','uiu-file-2008-21','uiu-file-2014-014','uiu-file-2014-158','uiu-file-2016-004','uiu-file-2017-003','uiu-file-2017-102','uiu-file-2018-479','uiu-file-2020-650','uiu-file-2021-121','red-pool-superfund-site','uiu-file-2024-092','dossier-lph','paramax','three-portlands-hub','site-19-dossier','paralaw','uiu-file-1974-028','failed-president-crenshaw-assassination-attempt']),
  ('com', array['gdi:global-occult-coalition-goc','analysis-of-the-plokamisuchus','archival-document-hsa-008-advent','253-782-seattle-2026','kte-0003-carcinomafather','kte-0154-blackwood-gorgon','kte-0641-white-domino','kte-1221-parallax-nacl-carcinoma','kte-2013-kapala-mendes','kte-2039-carcinoma-oder-templum','kte-2957-white-cresentchild','kte-5503-bice-copernicus','kte-5634-ex-machina-bosch','kte-6024-blit-nuntius','kte-6990-mendel-nimuebusterchild','kte-9817-bluebuster-mendel-shelley-renegade-armbrusteri','lte-0851-cetus','lte-1004-caliburn-velveteen','lte-1998-burnout-blaecca-parallax','lte-2712-bosch','lte-6679-otranto-silver','lte-7433-goodrick-kringle','lte-8686-yellow-kewpie','nt-4041-nimuedianetic-karhu','nte-2858-cyan-blaecca','operation-kontra-simoy-after-action-report','project-grant-transmutative-buoyancy','pepsi-coke-territorial-holdings','group-bogeyman','pte-cyan-atypical-alkahest','ptt-1666-gray-templum','project-roc-part-1','fate-of-avalon','price-of-forty-days','ute-1919-discofather','ute-2077-tiercel-buster','ute-9839-templum-ebbinghaus']),
  ('reine-noire', array['gdi:the-black-queen','acopalypse','carnifex-carl','cassandra','first-contact','grabnoks-the-destroyers','lambda-killer','love-is-an-unwritten-thesis','mr-normie','moon-heist','on-the-subject-of-the-coarse-mannered-men','prantortiz-the-vile','paris-massacre','ragnarok','richardson-island','sounds-of-silver','sweeter-dreams-inc','tko','nebiros','deer-girl-bq','corncrake-of-destiny','the-hanged-king-s-tragedy','the-knight-of-flowers','the-despicable-regime','milkssiah','the-queen-in-green','razing-of-the-library','the-skylarking-gala','timeline-i-5']),
  ('cirque', array['gdi:herman-fuller-s-circus-of-the-disquieting','herman-fuller-presents-furmanism','herman-fuller-presents-eucestodiel','icky-the-magic-clown','maya-the-magnificent','herman-fuller-presents-meeting-the-maker','nixie-the-nereid','herman-fuller-presents-peter-cottontail-s-cotton-candy','shapes-the-clown','the-amazing-sluggo','the-amazing-zoltan','herman-fuller-presents-the-beastly-quasimodo','candy-cat','doctor-muerte','the-dread-behemoth','the-fishman-of-manasquan','the-flame-faced-man','the-indestructible-man','the-last-inca','the-living-head','the-lovers','herman-fuller-presents-the-one-sent-by-god','the-penitent-man','the-skeleton-dance','herman-fuller-presents-the-tunnel-of-love']),
  ('insurrection', array['gdi:the-chaos-insurgency','blind-the-all-seeing-eye','cell-overview-the-cogs','koigarezaki-news-911-1998-ver','manna-wikipedia','sc-015-060-015-130','sc-02-000-22-000','sc-02-45-02-49-renaissance-phase-2','sc-049-100-049-103','sc-05-321-05-335','sc-10-548-12-893','sc-11-11-1-i','sc-13-234-14-362','sc-14-126-20-921','sc-18-005-18-350','sc-19-102-20-120','sc-48-404-97-786','sc-49-785-52-543','sc-63-141-65-030','sc-95-347-00-723','sc-99-734-01-506','step-compilation-rejection','step-compilation-what-a-day-that-was','kompas-parapolityczny-na-trudne-czasy']),
  ('prometheus', array['gdi:prometheus-labs-inc','procurement-orders-hells-heart','file-no-hkc454','cierpienia-noworoczne','grant-request-for-a-replacement-keyboard-because-the-caps-lo','grant-request-for-genetically-engineering-low-cost-organic-a','grant-request-for-greene-to-stop-making-fun-of-me','grant-request-for-investigating-the-potential-application-of','grant-request-for-the-construction-of-an-interstellar-scienc','wniosek-o-dotacje-na-opracowanie-srodka-przeciwko-alergii','grant-request-for-the-creation-of-remnant-hosts','grant-request-for-mechacrocosquid','grant-request-for-the-development-of-a-portable-type-blue-co','grant-request-for-the-development-of-tools-for-mapping-local','grant-request-for-the-manufacture-of-devices-to-regulate','surgical-identity-perpetuation','grant-request-post-mortem-neural-preservation','grant-request-for-the-usage-of-biological-signaling-molecule','wniosek-o-dotacje-na-wykorzystanie-paryskiej-architektury','grant-request-for-the-utilization-of-sub-reality-spaces','grant-request-for-usage-of-biological-organisms-to-facilitat','grant-request-for-utilization-of-electro-thaumic-computers-t','redzone-sa-43647822']),
  ('dieu-brise', array['gdi:church-of-the-broken-god','diaevas-people-wikipedia','fragments-regarding-legate-trunnion-apostate','galabor-exe','goac-chapter-2-js','gohw-chapter-5-dot-js','haeretische-aufzeichnung-11','hist-327-comparative-mythology-of-mekhanism-and-naelkae','scp-001-wikipedia','broken-mind','the-cogwork-cult','the-heart-of-mekhane','the-revelation-of-st-aristeas','sermon-in-the-park','the-book-of-gnosis-repairers-vol-of-psalms-part-1','v19113a-01','v2101a01','v5513a-96','wans-image-png'])
    ) as l(collection, cartes)
on conflict do nothing;

-- Le catalogue des cosmétiques, ceux qu'on possède et ceux qu'on porte
create or replace function public.cosmetiques() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'catalogue', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'prix', c.prix,
                                          'possede', exists (select 1 from prive.cosmetiques_possedes o
                                                              where o.joueur = prive.joueur() and o.cosmetique = c.id))
                       order by c.type, c.ordre)
        from prive.cosmetiques c), '[]'::jsonb),
    'portes', (select cosmetiques from public.profils where id = prive.joueur()));
$$;

create or replace function public.acheter_cosmetique(p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  c prive.cosmetiques;
begin
  perform 1 from public.profils where id = moi for update;
  select * into c from prive.cosmetiques where id = p_id;
  if not found then
    raise exception 'Cosmétique inconnu';
  end if;
  if c.prix is null then
    raise exception 'Ce cosmétique ne s''achète pas : il se gagne en complétant une collection';
  end if;
  if exists (select 1 from prive.cosmetiques_possedes where joueur = moi and cosmetique = c.id) then
    raise exception 'Vous le possédez déjà';
  end if;
  if (select credits from public.profils where id = moi) < c.prix then
    raise exception 'Crédits insuffisants';
  end if;
  perform prive.crediter(moi, -c.prix, 'cosmetique', c.id);
  insert into prive.cosmetiques_possedes (joueur, cosmetique) values (moi, c.id);
  -- Porté d'office : on vient de le payer
  update public.profils set cosmetiques = cosmetiques || jsonb_build_object(c.type, c.id) where id = moi;
  return jsonb_build_object('cosmetiques', public.cosmetiques(), 'profil', prive.profil_json(moi));
end $$;

-- Porter un cosmétique possédé, ou rien (p_id vide) pour ce type
create or replace function public.porter_cosmetique(p_type text, p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if p_type not in ('titre', 'cadre', 'couverture') then
    raise exception 'Type de cosmétique inconnu';
  end if;
  if p_id is null then
    update public.profils set cosmetiques = cosmetiques - p_type where id = moi;
  else
    if not exists (select 1 from prive.cosmetiques_possedes o join prive.cosmetiques c on c.id = o.cosmetique
                    where o.joueur = moi and o.cosmetique = p_id and c.type = p_type) then
      raise exception 'Vous ne possédez pas ce cosmétique';
    end if;
    update public.profils set cosmetiques = cosmetiques || jsonb_build_object(p_type, p_id) where id = moi;
  end if;
  return public.cosmetiques();
end $$;

-- Les collections : combien de fiches on en possède, et si la récompense est déjà réclamée
create or replace function public.collections_gdi() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'titre', k.titre,
      'cartes', (select jsonb_agg(m.carte_id order by m.carte_id)
                   from prive.collections_cartes m join public.cartes c on c.id = m.carte_id where m.collection = k.id),
      'possedees', (select count(*) from prive.collections_cartes m
                     where m.collection = k.id
                       and exists (select 1 from public.cartes c where c.id = m.carte_id)
                       and exists (select 1 from public.exemplaires x where x.proprietaire = prive.joueur() and x.carte_id = m.carte_id)),
      'reclamee', exists (select 1 from prive.collections_reclamees r where r.joueur = prive.joueur() and r.collection = k.id))
    order by k.ordre), '[]'::jsonb)
  from prive.collections k;
$$;

create or replace function public.reclamer_collection(p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  manquantes int;
begin
  perform 1 from public.profils where id = moi for update;
  if not exists (select 1 from prive.collections where id = p_id) then
    raise exception 'Collection inconnue';
  end if;
  select count(*) into manquantes
    from prive.collections_cartes m join public.cartes c on c.id = m.carte_id
   where m.collection = p_id
     and not exists (select 1 from public.exemplaires x where x.proprietaire = moi and x.carte_id = m.carte_id);
  if manquantes > 0 then
    raise exception 'Collection incomplète : il manque % fiche(s)', manquantes;
  end if;
  insert into prive.collections_reclamees (joueur, collection) values (moi, p_id) on conflict do nothing;
  if not found then
    raise exception 'Récompense déjà réclamée';
  end if;
  insert into prive.cosmetiques_possedes (joueur, cosmetique)
    select moi, id from prive.cosmetiques where id in ('titre-' || p_id, 'cadre-' || p_id)
  on conflict do nothing;
  return jsonb_build_object('collections', public.collections_gdi(), 'cosmetiques', public.cosmetiques());
end $$;

-- Le profil public montre le titre et le cadre portés
create or replace function public.profil_public(p_pseudo text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  lui uuid := prive.id_du_pseudo(p_pseudo);
  p public.profils;
begin
  select * into p from public.profils where id = lui;
  return jsonb_build_object(
    'pseudo', p.pseudo, 'xp', p.xp, 'elo', p.elo, 'credits', p.credits, 'jcj', p.jcj, 'stats', p.stats,
    'enLigne', prive.en_ligne(p.vu_le), 'vuLe', p.vu_le, 'creeLe', p.cree_le, 'moi', lui = moi,
    'titre', p.cosmetiques ->> 'titre', 'cadre', p.cosmetiques ->> 'cadre',
    'rangElo', (select count(*) + 1 from public.profils q where q.pseudo is not null and q.elo > p.elo),
    'collection', (select count(distinct carte_id) from public.exemplaires where proprietaire = lui),
    'legendaires', prive.valeur_classement(lui, 'legendaires'),
    'badges', to_jsonb(prive.badges_obtenus(lui)),
    'badgesAffiches', to_jsonb(prive.badges_affiches(lui)),
    'vitrine', coalesce((
      select jsonb_agg(jsonb_build_object('carte', v.c,
        'variante', coalesce((select x.variante from public.exemplaires x where x.proprietaire = lui and x.carte_id = v.c
                              order by array_position(array['o5', 'breche', 'esquisse', 'negatif', 'arch', 'exp', 'holo', 'std'], x.variante)
                              limit 1), 'std'))
        order by v.n)
      from unnest(p.vitrine) with ordinality v(c, n)
      where exists (select 1 from public.exemplaires x where x.proprietaire = lui and x.carte_id = v.c)), '[]'::jsonb),
    'clan', (select jsonb_build_object('nom', c.nom, 'tag', c.tag, 'role', m.role)
             from prive.membres_clan m join prive.clans c on c.id = m.clan where m.joueur = lui),
    'relation', case
      when lui = moi then null
      when exists (select 1 from prive.blocages where joueur = moi and bloque = lui) then 'bloque'
      when prive.sont_amis(moi, lui) then 'ami'
      when exists (select 1 from prive.amities where de = moi and vers = lui) then 'demande_envoyee'
      when exists (select 1 from prive.amities where de = lui and vers = moi) then 'demande_recue'
      else 'aucune' end,
    'duels', coalesce((
      select jsonb_agg(jsonb_build_object('adversaire', q.pseudo, 'issue',
        case when d.issue = 'nul' then 'nul' when d.gagnant = lui then 'victoire' else 'defaite' end,
        'classe', d.classe, 'le', d.maj_le) order by d.maj_le desc)
      from (select * from public.duels_jcj
            where statut = 'termine' and lui in (joueur_a, joueur_b) order by maj_le desc limit 10) d
      join public.profils q on q.id = case when d.joueur_a = lui then d.joueur_b else d.joueur_a end), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Notifications sur l'appareil (Web Push)
-- ---------------------------------------------------------------------------
create table if not exists prive.abonnements_push (
  endpoint text primary key,
  joueur uuid not null references public.profils on delete cascade,
  p256dh text not null,
  auth text not null,
  cree_le timestamptz not null default now()
);
create index if not exists abonnements_push_joueur on prive.abonnements_push (joueur);
alter table prive.abonnements_push enable row level security;

create table if not exists prive.push_file (
  id bigserial primary key,
  joueur uuid not null references public.profils on delete cascade,
  type text not null,
  donnees jsonb not null default '{}',
  cree_le timestamptz not null default now()
);
alter table prive.push_file enable row level security;

-- Un appareil s'abonne (5 au plus par agent : le plus ancien laisse sa place)
create or replace function public.abonner_push(p_endpoint text, p_p256dh text, p_auth text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
begin
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) not between 80 and 100
     or length(p_auth) not between 16 and 30 then
    raise exception 'Abonnement invalide';
  end if;
  insert into prive.abonnements_push (endpoint, joueur, p256dh, auth) values (p_endpoint, moi, p_p256dh, p_auth)
  on conflict (endpoint) do update set joueur = moi, p256dh = excluded.p256dh, auth = excluded.auth, cree_le = now();
  delete from prive.abonnements_push where joueur = moi and endpoint not in (
    select endpoint from prive.abonnements_push where joueur = moi order by cree_le desc limit 5);
  return true;
end $$;

create or replace function public.desabonner_push(p_endpoint text) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from prive.abonnements_push where endpoint = p_endpoint and joueur = prive.joueur() returning true;
$$;

-- Ce qui part sur l'appareil : chaque notification de la cloche, si l'agent n'est pas déjà dans le jeu
create or replace function prive.pousser_notification() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from prive.abonnements_push where joueur = new.joueur)
     and not exists (select 1 from public.profils where id = new.joueur and prive.en_ligne(vu_le)) then
    insert into prive.push_file (joueur, type, donnees) values (new.joueur, new.type, new.donnees);
  end if;
  return null;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function prive.pousser_notification();

-- Un message privé : un seul envoi en attente par conversation, pour qu'une rafale ne fasse qu'une notification
create or replace function prive.pousser_message() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  dest uuid;
begin
  if new.salon not like 'mp:%' or new.auteur is null then
    return null;
  end if;
  dest := case when split_part(new.salon, ':', 2) = new.auteur::text then split_part(new.salon, ':', 3) else split_part(new.salon, ':', 2) end::uuid;
  if exists (select 1 from prive.abonnements_push where joueur = dest)
     and not exists (select 1 from public.profils where id = dest and prive.en_ligne(vu_le))
     and not exists (select 1 from prive.push_file where joueur = dest and type = 'message' and donnees ->> 'de' = new.pseudo) then
    insert into prive.push_file (joueur, type, donnees)
      values (dest, 'message', jsonb_build_object('de', new.pseudo, 'texte', left(new.texte, 120)));
  end if;
  return null;
end $$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute function prive.pousser_message();

-- Pour la fonction Edge : la file à envoyer (100 au plus par passage), avec les appareils de chaque agent
create or replace function public.push_a_envoyer() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  lot jsonb;
begin
  -- Une notification restée plus d'une heure en file n'a plus d'intérêt
  delete from prive.push_file where cree_le < now() - interval '1 hour';
  with pris as (
    delete from prive.push_file where id in (select id from prive.push_file order by id limit 100 for update skip locked)
    returning joueur, type, donnees
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'type', p.type, 'donnees', p.donnees,
      'appareils', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth)), '[]'::jsonb)
                      from prive.abonnements_push a where a.joueur = p.joueur))), '[]'::jsonb)
    into lot from pris p;
  return lot;
end $$;

-- Pour la fonction Edge : les appareils qui se sont désabonnés (le service de notifications répond 404 ou 410)
create or replace function public.push_expires(p_endpoints text[]) returns void
language sql volatile security definer set search_path = public, pg_temp as $$
  delete from prive.abonnements_push where endpoint = any (p_endpoints);
$$;

-- Chaque minute, s'il y a quelque chose à envoyer, pg_net réveille la fonction Edge (qui vide la file)
create or replace function prive.declencher_push() returns void
language plpgsql volatile as $$
begin
  if not exists (select 1 from prive.push_file) then
    return;
  end if;
  perform net.http_post(
    url := 'https://mwsoqzrpgghwtiazuios.supabase.co/functions/v1/duel',
    body := '{"action": "push"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 20000);
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('scp-masters-push', '* * * * *', 'select prive.declencher_push()');
  end if;
exception when others then
  raise notice 'Envoi des notifications sur l''appareil non planifié : %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------
revoke execute on function
  public.registre_mythique(text), public.fusions_restantes(), public.fusionner(text), public.cote_marche(),
  public.cosmetiques(), public.acheter_cosmetique(text), public.porter_cosmetique(text, text), public.collections_gdi(),
  public.reclamer_collection(text), public.abonner_push(text, text, text), public.desabonner_push(text),
  public.push_a_envoyer(), public.push_expires(text[])
  from public, anon;
grant execute on function
  public.registre_mythique(text), public.fusions_restantes(), public.fusionner(text), public.cote_marche(),
  public.cosmetiques(), public.acheter_cosmetique(text), public.porter_cosmetique(text, text), public.collections_gdi(),
  public.reclamer_collection(text), public.abonner_push(text, text, text), public.desabonner_push(text)
  to authenticated;
revoke execute on function public.push_a_envoyer(), public.push_expires(text[]) from authenticated;
grant execute on function public.push_a_envoyer(), public.push_expires(text[]) to service_role;
