-- SCP Masters : rareté Mythique (5), cartes Département (type « e »), propositions SCP-001 et entités.
-- Les Mythiques ne suivent pas le tirage par rareté : chaque carte d'un dossier a une petite chance
-- (prive.types_boosters.mythique) d'en être une, numérotée dans l'ordre d'obtention.
-- Constantes à garder synchronisées avec src/engine/boosters.ts.

-- ---------------------------------------------------------------------------
-- 1. Catalogue : nouveau type et nouvelle rareté
-- ---------------------------------------------------------------------------
alter table public.cartes drop constraint if exists cartes_k_check;
alter table public.cartes drop constraint if exists cartes_ra_check;
alter table public.cartes add constraint cartes_k_check check (k in ('s', 'f', 'p', 'e', 'g', 'n', 'd', 'c'));
alter table public.cartes add constraint cartes_ra_check check (ra between 0 and 5);

-- ---------------------------------------------------------------------------
-- 2. Boosters : départements dans les mélanges, chance de Mythique par carte
-- ---------------------------------------------------------------------------
alter table prive.types_boosters add column if not exists mythique float8 not null default 0;

update prive.types_boosters set
  types = case id
    when 'personnel' then '{"p":0.4,"f":0.27,"g":0.13,"n":0.1,"e":0.1}'::jsonb
    when 'scp' then types
    when 'contes' then types
    else '{"s":0.64,"c":0.14,"d":0.05,"p":0.06,"f":0.04,"g":0.03,"n":0.02,"e":0.02}'::jsonb
  end,
  mythique = case id
    when 'personnel' then 0.0008
    when 'keter' then 0.0012
    when 'o5' then 0.004
    else 0.0004
  end;

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

-- ---------------------------------------------------------------------------
-- 3. Valeurs de recyclage et de brûlage : 2 500 ₵ pour une Mythique
-- ---------------------------------------------------------------------------
create or replace function prive.valeur_brulage(p_rarete int, p_variante text) returns int
language sql immutable as $$
  select (array[5, 12, 35, 90, 300, 2500])[p_rarete + 1]
    * case p_variante when 'holo' then 3 when 'exp' then 4 when 'arch' then 6 when 'breche' then 12 when 'o5' then 30 else 1 end;
$$;

create or replace function prive.recycler(p_joueur uuid, p_carte text) returns int
language plpgsql volatile as $$
declare
  libres int;
  recyclables int;
  a_recycler int;
  rarete int;
  gain int;
begin
  select count(*) filter (where bloque_par is null),
         count(*) filter (where variante = 'std' and origine <> 'souvenir' and bloque_par is null)
    into libres, recyclables
    from public.exemplaires where proprietaire = p_joueur and carte_id = p_carte;
  a_recycler := case when libres - recyclables >= 1 then recyclables else greatest(recyclables - 1, 0) end;
  if a_recycler = 0 then
    return 0;
  end if;
  select ra into rarete from public.cartes where id = p_carte;
  gain := a_recycler * (array[5, 12, 35, 90, 300, 2500])[rarete + 1];
  delete from public.exemplaires where id in (
    select id from public.exemplaires
    where proprietaire = p_joueur and carte_id = p_carte and variante = 'std' and origine <> 'souvenir' and bloque_par is null
    order by numero_serie desc nulls first
    limit a_recycler);
  update public.profils set credits = credits + gain where id = p_joueur;
  insert into public.mouvements_credits (joueur, montant, motif, reference) values (p_joueur, gain, 'recyclage', p_carte);
  return gain;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Classement « Légendaires » : les Mythiques comptent aussi
-- ---------------------------------------------------------------------------
create or replace function prive.valeur_classement(p_joueur uuid, p_tableau text) returns bigint
language sql stable as $$
  select case p_tableau
    when 'elo' then p.elo
    when 'richesse' then p.credits
    when 'xp' then p.xp
    when 'victoires' then (p.jcj ->> 'victoires')::bigint
    when 'collection' then (select count(distinct carte_id) from public.exemplaires where proprietaire = p.id)
    when 'legendaires' then (select count(distinct x.carte_id) from public.exemplaires x join public.cartes c on c.id = x.carte_id
                             where x.proprietaire = p.id and c.ra >= 4)
  end
  from public.profils p where p.id = p_joueur;
$$;

-- ---------------------------------------------------------------------------
-- 5. Brûlage groupé, depuis la sélection multiple des archives (exemplaires standard seulement)
-- ---------------------------------------------------------------------------
-- p_mode : « un » brûle un exemplaire de chaque carte, « doublons » en garde un, « tous » brûle tout ce qui est libre
create function public.bruler_lot(p_cartes text[], p_mode text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  carte text;
  total int;
  libres int;
  nombre int;
  valeur int;
  gain bigint := 0;
  detruits int := 0;
begin
  if p_mode not in ('un', 'doublons', 'tous') then
    raise exception 'Mode de brûlage inconnu';
  end if;
  if cardinality(p_cartes) > 500 then
    raise exception 'Trop de dossiers à la fois (500 au plus)';
  end if;
  perform 1 from public.profils where id = moi for update;
  for carte in select distinct c from unnest(coalesce(p_cartes, '{}')) c loop
    select count(*), count(*) filter (where variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir')
      into total, libres
      from public.exemplaires where proprietaire = moi and carte_id = carte;
    nombre := case p_mode when 'un' then least(libres, 1) when 'doublons' then least(libres, total - 1) else libres end;
    continue when nombre <= 0;
    select prive.valeur_brulage(c.ra, 'std') into valeur from public.cartes c where c.id = carte;
    delete from public.exemplaires where id in (
      select id from public.exemplaires
      where proprietaire = moi and carte_id = carte and variante = 'std' and echangeable and bloque_par is null and origine <> 'souvenir'
      order by numero_serie desc nulls last, obtenu_le desc
      limit nombre);
    perform prive.crediter(moi, (nombre * valeur)::bigint, 'brulage', carte || ':std');
    gain := gain + nombre * valeur;
    detruits := detruits + nombre;
  end loop;
  perform prive.nettoyer_equipe(moi);
  return jsonb_build_object('gain', gain, 'detruits', detruits, 'profil', prive.profil_json(moi));
end $$;

-- ---------------------------------------------------------------------------
-- 6. Badges de profil : calculés par le serveur à chaque lecture, 3 au plus affichés à côté du pseudo
-- ---------------------------------------------------------------------------
-- Badges attribués à la main (créateur du jeu…)
create table prive.badges_speciaux (
  joueur uuid not null references public.profils on delete cascade,
  badge text not null,
  primary key (joueur, badge)
);
alter table public.profils add column if not exists badges text[] not null default '{}';

-- Les badges obtenus, dans l'ordre d'affichage. Liste à garder synchronisée avec src/data/badges.ts
create function prive.badges_obtenus(p_joueur uuid) returns text[]
language sql stable as $$
  with p as (select * from public.profils where id = p_joueur),
  x as (
    select count(distinct e.carte_id) as distinctes,
           count(distinct e.carte_id) filter (where c.ra >= 4) as legendaires,
           count(distinct e.carte_id) filter (where c.ra = 5) as mythiques,
           coalesce(bool_or(e.variante = 'o5'), false) as o5
    from public.exemplaires e join public.cartes c on c.id = e.carte_id
    where e.proprietaire = p_joueur)
  select coalesce(array_agg(b order by o), '{}') from (
    select badge as b, 0 as o from prive.badges_speciaux where joueur = p_joueur
    union all select 'premier-dossier', 1 from p where coalesce((p.stats ->> 'boostersOuverts')::int, 0) >= 1
    union all select 'archiviste', 2 from x where distinctes >= 100
    union all select 'conservateur', 3 from x where distinctes >= 1000
    union all select 'bibliothecaire', 4 from x where distinctes >= 5000
    union all select 'legende', 5 from x where legendaires >= 1
    union all select 'pantheon', 6 from x where legendaires >= 10
    union all select 'niveau-5', 7 from x where mythiques >= 1
    union all select 'variante-o5', 8 from x where o5
    union all select 'duelliste', 9 from p where coalesce((p.jcj ->> 'victoires')::int, 0) >= 1
    union all select 'veteran', 10 from p where coalesce((p.jcj ->> 'victoires')::int, 0) >= 25
    union all select 'elite', 11 from p where p.elo >= 1200
    union all select 'commandant', 12 from p where p.elo >= 1500
    union all select 'esprit-de-corps', 13 where exists (select 1 from prive.membres_clan where joueur = p_joueur)
    union all select 'marchand', 14 where exists (select 1 from public.mouvements_credits where joueur = p_joueur and motif = 'vente')
    union all select 'premiere-heure', 15 from p where p.cree_le < '2026-12-01'
  ) t;
$$;

-- Badges affichés encore obtenus (un badge perdu, comme une place d'Elo, disparaît de l'affichage)
create function prive.badges_affiches(p_joueur uuid) returns text[]
language sql stable as $$
  select coalesce(array_agg(b order by n), '{}')
  from public.profils p, unnest(p.badges) with ordinality a(b, n)
  where p.id = p_joueur and a.b = any (prive.badges_obtenus(p_joueur));
$$;

create function public.choisir_badges(p_badges text[]) returns text[]
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  moi uuid := prive.joueur();
  choisis text[] := (select coalesce(array_agg(b order by n), '{}') from (
    select b, min(n) as n from unnest(coalesce(p_badges, '{}')) with ordinality a(b, n) group by b) t);
begin
  if cardinality(choisis) > 3 or not choisis <@ prive.badges_obtenus(moi) then
    raise exception 'Trois badges obtenus au plus';
  end if;
  update public.profils set badges = choisis where id = moi;
  return choisis;
end $$;

-- Le créateur du jeu
insert into prive.badges_speciaux (joueur, badge)
  select id, 'createur' from public.profils where lower(pseudo) = 'rotavlas'
  on conflict do nothing;

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
    'rangElo', (select count(*) + 1 from public.profils q where q.pseudo is not null and q.elo > p.elo),
    'collection', (select count(distinct carte_id) from public.exemplaires where proprietaire = lui),
    'legendaires', prive.valeur_classement(lui, 'legendaires'),
    'badges', to_jsonb(prive.badges_obtenus(lui)),
    'badgesAffiches', to_jsonb(prive.badges_affiches(lui)),
    'vitrine', coalesce((
      select jsonb_agg(jsonb_build_object('carte', v.c,
        'variante', coalesce((select x.variante from public.exemplaires x where x.proprietaire = lui and x.carte_id = v.c
                              order by array_position(array['o5', 'breche', 'arch', 'exp', 'holo', 'std'], x.variante) limit 1), 'std'))
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

revoke execute on function public.bruler_lot(text[], text), public.choisir_badges(text[]) from public, anon;
grant execute on function public.bruler_lot(text[], text), public.choisir_badges(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Catalogue : nouvelles cartes et raretés changées (outils/catalogue_sql.mjs, voir ci-dessous)
-- ---------------------------------------------------------------------------
insert into public.cartes (id, k, ra)
select id, 's', 4 from unnest(array['qntm-s-proposal','jonathan-ball-s-proposal','dr-gears-s-proposal','dr-manns-proposal','mackenzie-s-proposal','sandrewswann-s-proposal','scantron-s-proposal','djoric-dmatix-proposal','ouroboros','kate-mctiriss-s-proposal','wrong-proposal','shaggydredlocks-proposal','spikebrennan-s-proposal','wjs-proposal','billiths-proposal','tanhony-s-proposal','lily-s-proposal','tuftos-proposal','liz-the-gm-s-proposal','i-h-p-proposal','scp-001-ex','wmdd-s-proposal','psul-001','captain-kirby-s-proposal','pedantique-s-proposal','not-a-seagull-proposal','jack-ike-s-proposal-i','jack-ike-s-proposal-ii','tanhony-s-proposal-ii','swelling-of-the-worlds','mcdoctorate-s-proposal','rounderhouse-proposal','manymeats-proposal','keter-duty','pickman-blank-proposal','rounderhouse-gold-proposal','ralliston-s-proposal','nagiros-proposal','rounderhouse-jade-proposal','plague-s-proposal','jack-ike-s-proposal-iv','dyfscp0012','nico-proposal','dr-cimmerian-s-proposal','oris-proposal','dyfscp0013','nicos-proposal-ii','dr-frueh-s-proposal','rounderhouse-bone-proposal','metaphysician-karpin-proposal','yoshihides-proposal','calibold-harryblank-nico-proposal','etc-proposal','poufys-proposal','dyfscp0014','queerious-proposal','lulus-proposal','the-communitys-proposal','001-blank-i','bleep-s-onyx-proposal','nico-queer-001','billiths-proposal-ii','scp-169']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 's', 5 from unnest(array['dr-clef-s-proposal']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 's', 0 from unnest(array['scp-117','scp-416','scp-1373','scp-1843','scp-2312','scp-2379','scp-3403','scp-3677','scp-4843','scp-4884','scp-5159','scp-5449','scp-5651','scp-5946','scp-6368','scp-6387','scp-7663','scp-7773','scp-8728']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 's', 3 from unnest(array['scp-3984','scp-4040']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 's', 1 from unnest(array['scp-4746','scp-5729','scp-6118','scp-6400']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'f', 5 from unnest(array['fim:alpha-1']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'f', 4 from unnest(array['fim:r-sh-1']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 5 from unnest(array['perso:the-administrator','perso:aaron-siegel','perso:o5-1','perso:les-auteurs','entite:scarlet-king']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 0 from unnest(array['perso:alison-chao-aka-the-black-queen','entite:anafabula','entite:malo','perso:researcher-jacob-conwell','perso:sheldon-katz-esq','entite:brothers-of-death','entite:with-many-voices']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 2 from unnest(array['entite:children-of-the-night','perso:dr-benjamin-kondraki','perso:dr-william-w-wettle','entite:homo-sapiens-sidhe','entite:pattern-screamer','entite:hanged-king','entite:yaldabaoth']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 1 from unnest(array['perso:d-c-al-fine','perso:director-vivian-lesley-scout','perso:dr-katherine-sinclair','entite:finnfolk','entite:pangloss','entite:queen-mab','perso:the-critic']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 4 from unnest(array['perso:filename']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 3 from unnest(array['entite:mister','entite:nameless','entite:the-serpent']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'e', 0 from unnest(array['dept:engagement-division','dept:continuity-dept','dept:deletions-dept','dept:geology-dept','dept:folklore-dept','dept:department-of-other','dept:procurement-liquidation-dept','dept:mathematics-dept','dept:spicy-crust-pizzeria','dept:telecom-office']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'e', 2 from unnest(array['dept:antimemetics-division','dept:decommissioning-dept','dept:pataphysics-dept','dept:raisa']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'e', 1 from unnest(array['dept:abnormalities','dept:miscommunications','dept:surrealistics-dept','dept:ettra','dept:fire-suppression-dept','dept:unreality-dept']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'e', 3 from unnest(array['dept:tactical-theology','dept:delta-t']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'e', 4 from unnest(array['dept:ethics-committee']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'c', 3 from unnest(array['nico-proposal-2']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;
