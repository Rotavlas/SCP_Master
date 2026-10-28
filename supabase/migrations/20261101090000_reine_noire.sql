-- La Reine Noire passe Légendaire : le groupe d'intérêt et Alison Chao, qui la porte (choix du créateur du jeu).
-- À exécuter dans le SQL Editor de Supabase.

insert into public.cartes (id, k, ra)
select id, 'p', 4 from unnest(array['perso:alison-chao-aka-the-black-queen']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;

insert into public.cartes (id, k, ra)
select id, 'g', 4 from unnest(array['gdi:the-black-queen']) as id
on conflict (id) do update set k = excluded.k, ra = excluded.ra;
