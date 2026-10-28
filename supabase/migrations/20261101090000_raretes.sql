-- Raretés choisies par le créateur du jeu :
--   Mythiques : SCP-173 et SCP-2747 (l'anafabula) ;
--   Légendaires : Alison Chao (la Reine Noire), tout le Conseil O5 (O5-1 reste Mythique) et les grandes entités
--   (Yaldabaoth, le Roi Pendu, le Serpent, les Sans-Nom, l'anafabula).
-- Le groupe d'intérêt de la Reine Noire garde sa rareté (une version précédente de cette migration le passait Légendaire).
-- Les exemplaires déjà possédés de SCP-173 et SCP-2747 deviennent Mythiques.
-- À exécuter dans le SQL Editor de Supabase.

insert into public.cartes (id, k, ra)
select id, 's', 5 from unnest(array['scp-173','scp-2747']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'p', 4 from unnest(array['perso:alison-chao-aka-the-black-queen','entite:anafabula','perso:o5-command','perso:o5-10','perso:o5-11','perso:o5-12','perso:o5-13','perso:o5-5','perso:o5-6','perso:o5-8','perso:o5-9','entite:hanged-king','entite:nameless','entite:the-serpent','entite:yaldabaoth']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

update public.cartes set ra = 2 where id = 'gdi:the-black-queen';
