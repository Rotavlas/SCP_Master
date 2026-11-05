-- Codes à saisir par les joueurs (menu du compte → « Saisir un code »). À lancer dans le SQL Editor de Supabase.
-- Un code : lettres majuscules, chiffres et tirets (3 à 32). Chaque agent ne peut l'utiliser qu'une fois.
-- Récompense (chaque clé est facultative) :
--   credits    : crédits ajoutés
--   dossiers   : dossiers gratuits ajoutés à la réserve (10 au plus en réserve)
--   keter      : dossiers Keter offerts
--   cosmetique : un cosmétique de prive.cosmetiques (titre, cadre, couverture), par son identifiant
-- utilisations_max : nombre total d'agents qui peuvent l'utiliser (vide : illimité)
-- expire_le        : date de fin (vide : jamais)

-- Exemple : un code de lancement, 100 premiers agents, valable une semaine
-- insert into prive.codes (code, recompense, description, utilisations_max, expire_le)
-- values ('SITE19', '{"credits": 300, "dossiers": 3}', 'Code de lancement', 100, now() + interval '7 days');

-- Exemple : un cosmétique offert sur un stream, sans limite de nombre, valable 24 heures
-- insert into prive.codes (code, recompense, description, expire_le)
-- values ('CONFINEMENT', '{"cosmetique": "couv-quadrille"}', 'Stream du 15 novembre', now() + interval '1 day');

-- Les codes et combien d'agents les ont utilisés
select c.code, c.description, c.recompense, c.utilisations_max, c.expire_le,
       (select count(*) from prive.codes_utilises u where u.code = c.code) as utilisations
  from prive.codes c
 order by c.cree_le desc;

-- Désactiver un code tout de suite
-- update prive.codes set expire_le = now() where code = 'SITE19';
