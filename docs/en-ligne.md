# SCP Masters en ligne : conception

État : l'étape 1 (comptes et collection côté serveur) est en production sur https://scp-masters.vercel.app, et le jeu ne se joue plus qu'en ligne. Le reste est encore à l'état de conception. Ce document pose l'architecture des comptes, des échanges, des enchères, de la bourse, des clans et des duels entre joueurs, et propose un ordre de réalisation.

## 1. Le principe qui change tout : le serveur fait foi

Aujourd'hui tout vit dans le `localStorage` du navigateur : n'importe qui peut s'ajouter 500 cartes légendaires depuis la console. Tant qu'on joue seul, ce n'est pas grave. Dès qu'il y a des échanges ou un classement, ça casse tout.

En ligne :

- **Le tirage des boosters, les crédits, la collection et les duels sont calculés côté serveur.** Le navigateur affiche et demande, il ne décide rien.
- **Chaque mouvement de valeur passe par une transaction SQL atomique** : un échange ne peut pas laisser une carte dupliquée ni des crédits perdus.
- **Le catalogue des cartes reste un fichier statique** (`cards.json`, versionné). Le serveur n'en garde que les identifiants, la rareté et les stats nécessaires aux duels.

## 2. Pile technique recommandée

| Besoin | Choix | Pourquoi |
|---|---|---|
| Base de données | **Supabase** (Postgres) | Les échanges et la bourse ont besoin de vraies transactions et de verrous de ligne. Postgres le fait nativement. |
| Comptes | Supabase Auth | Connexion Discord et Google en quelques clics, e-mail en secours. |
| Temps réel | Supabase Realtime | Enchères qui bougent en direct, duels entre joueurs, notifications. |
| Logique serveur | Fonctions Postgres (RPC) + Edge Functions | Le tirage aléatoire et les règles du jeu au plus près des données. |
| Tâches planifiées | `pg_cron` | Clôture des enchères, saisons de classement, boosters gratuits. |
| Front | Vercel (comme aujourd'hui) | Rien à changer. |

Hébergement en région UE (Supabase `eu-west`) pour le RGPD. Alternatives si Supabase ne convient pas : un serveur Node + Postgres sur Railway ou Fly.io (plus de contrôle, plus de travail), ou Firebase (moins adapté aux transactions entre joueurs).

## 3. Modèle de données

L'idée clé : **passer de compteurs (« 3 × SCP-173 ») à des exemplaires uniques.** Chaque carte obtenue devient une ligne avec son propre identifiant, sa variante et un numéro de série. C'est ce qui rend les échanges lisibles (« SCP-173 Sceau O5 n° 7 ») et traçables.

```sql
-- Joueurs
create table profils (
  id uuid primary key references auth.users,
  pseudo text unique not null check (length(pseudo) between 3 and 24),
  credits bigint not null default 200 check (credits >= 0),
  xp int not null default 0,
  boosters int not null default 3,
  dernier_booster timestamptz not null default now(),
  clan_id uuid references clans,
  elo int not null default 1000,
  cree_le timestamptz not null default now()
);

-- Un exemplaire = une carte possédée, unique et traçable
create table exemplaires (
  id uuid primary key default gen_random_uuid(),
  proprietaire uuid not null references profils,
  carte_id text not null,             -- id du catalogue (« scp-173 », « fim:epsilon-11 »…)
  variante text not null default 'std',
  numero_serie int not null,          -- n-ième exemplaire de cette carte et variante
  origine text not null,              -- booster, echange, enchere, bourse, recompense
  bloque_par uuid,                    -- offre, enchère ou ordre qui le réserve
  obtenu_le timestamptz not null default now(),
  unique (carte_id, variante, numero_serie)
);

-- Grand livre des crédits : chaque mouvement est tracé, le solde se recalcule
create table mouvements_credits (
  id bigserial primary key,
  joueur uuid not null references profils,
  montant bigint not null,            -- positif = gain, négatif = dépense
  motif text not null,                -- booster, duel, vente, achat, frais, recyclage…
  reference uuid,
  le timestamptz not null default now()
);

create table souhaits (joueur uuid references profils, carte_id text, primary key (joueur, carte_id));
```

Et, pour chaque fonctionnalité :

- **Échanges** : `offres_echange` (de, à, statut, expiration), `offres_echange_lignes` (exemplaire ou crédits, côté émetteur ou destinataire).
- **Enchères** : `encheres` (exemplaire, vendeur, prix de départ, achat immédiat, fin), `mises` (enchère, joueur, montant, horodatage).
- **Bourse** : `ordres` (joueur, carte_id, variante, sens achat/vente, prix limite, quantité, statut), `transactions_bourse` (historique des prix pour les graphiques).
- **Clans** : `clans` (nom, tag de 2 à 4 lettres, emblème, coffre de crédits), `membres_clan` (rôle : fondateur, officier, membre), `journal_clan`.
- **Duels** : `parties` (joueurs, état, graine aléatoire), `manches` (cartes jouées, question servie, réponses et temps mesurés par le serveur).

La sécurité passe par les règles RLS de Postgres : un joueur ne lit et n'écrit que ses lignes. Tout ce qui déplace de la valeur passe par une fonction `security definer`, jamais par un `update` direct depuis le navigateur.

## 4. Les fonctionnalités, une par une

### Ouverture de booster

Une fonction `ouvrir_booster(type)`, appelée par le client, fait tout dans une seule transaction :

1. Elle vérifie le stock ou les crédits et les décompte.
2. Elle tire les raretés, les cartes et les variantes avec l'aléatoire du serveur (même logique que `src/engine/boosters.ts`).
3. Elle insère les 5 exemplaires et renvoie le tirage.

Le client ne fait plus que l'animation. On peut publier les probabilités et journaliser chaque tirage pour pouvoir les vérifier.

### Échanges directs

- Le joueur A propose : ses exemplaires et crédits, contre des exemplaires et crédits de B.
- À la création, les exemplaires proposés sont **bloqués** (`bloque_par`) : impossible de les vendre deux fois.
- Quand B accepte, une fonction verrouille les lignes (`select … for update`), revérifie la propriété et échange tout d'un coup.
- **La liste de souhaits devient utile** : « 3 joueurs ont SCP-682 en double, et vous l'avez dans vos souhaits ». Proposer automatiquement des échanges équitables entre doublons et souhaits est probablement la fonctionnalité sociale la plus forte.

### Hôtel des ventes (enchères)

- Mise minimale = mise actuelle + 5 %. La mise est bloquée sur le solde du joueur, et rendue s'il est surenchéri.
- **Anti-dernière-seconde** : une mise dans les 2 dernières minutes repousse la fin de 2 minutes.
- Clôture par `pg_cron` toutes les minutes. Frais de 5 % prélevés au vendeur : c'est un puits à crédits, indispensable contre l'inflation.

### Bourse

Un carnet d'ordres par couple carte + variante : ordres d'achat et de vente à prix limite, exécutés automatiquement quand ils se croisent.

- Utile seulement pour les cartes très échangées. Pour le reste, l'hôtel des ventes suffit. **À faire en dernier**, quand il y aura assez de joueurs pour que les carnets ne soient pas vides.
- Chaque exécution alimente un historique : courbe de prix, prix médian sur 7 jours affiché dans le Répertoire.
- Frais de 2 % par transaction, encore un puits à crédits.

### Clans

- Création payante (par exemple 2 000 ₵), 30 membres maximum, rôles fondateur, officier et membre.
- Coffre commun alimenté par les dons, échanges internes sans frais.
- Objectifs de clan : compléter ensemble une série ou un canon, cumuler des victoires en duel. Classement des clans par saison.
- Plus tard : guerres de clans (une série de duels entre membres sur un week-end).

### Duels entre joueurs

- File d'attente de matchmaking par elo. Le duel se joue sur un canal Realtime privé.
- **Le serveur génère la question**, l'envoie aux deux joueurs en même temps et mesure lui-même les temps de réponse. Le client ne peut pas tricher sur la vitesse.
- La graine aléatoire de la partie est enregistrée : chaque partie peut être rejouée en cas de litige.
- Classement saisonnier avec récompenses (boosters, variante exclusive de saison).

## 5. Économie

| Sources de crédits | Puits de crédits |
|---|---|
| Boosters gratuits (cartes à recycler) | Boosters payants |
| Victoires en duel | Frais d'hôtel des ventes (5 %) et de bourse (2 %) |
| Objectifs quotidiens | Création de clan |
| Recyclage de doublons | Variantes cosmétiques achetables, si on veut |

Garde-fous :

- Plafond quotidien de gains en duel contre l'IA, pour que le farm ne finance pas tout le marché.
- Comptes de moins de 7 jours : échanges limités en valeur, pour freiner les multi-comptes qui alimentent un compte principal.
- Prix plancher et plafond indicatifs sur l'hôtel des ventes, à partir de la médiane, pour repérer les transferts déguisés.

**Argent réel : à ne pas faire, au moins au début.** WikiMasters vend une monnaie virtuelle et un abonnement, et se limite aux majeurs. Les boosters payants en argent réel relèvent des loot boxes, avec des contraintes juridiques réelles et des questions sur les mineurs. Le contenu SCP est sous licence CC BY-SA : on peut le réutiliser commercialement, mais il faut citer les auteurs et partager sous la même licence.

## 6. Triche et abus

- Tout l'aléatoire et tous les calculs de valeur se font côté serveur. Les règles RLS bloquent toute écriture directe.
- Limites de débit : boosters, offres, mises et messages par minute et par compte.
- Journal d'audit : le grand livre des crédits et l'origine de chaque exemplaire permettent de retracer n'importe quel abus.
- Signalement des joueurs et pseudos filtrés. Un chat de clan demande de la modération : à prévoir avant de l'ouvrir.

## 7. Et les parties locales actuelles ?

La sauvegarde locale ne peut pas être vérifiée : l'importer telle quelle, c'est accepter la triche. Deux options :

1. **Pas d'import** : tout le monde repart de zéro en ligne. C'est simple et juste.
2. **Import en « souvenir »** : la collection locale est copiée, marquée non échangeable et exclue des classements. Les joueurs gardent leurs cartes, mais elles n'ont pas de valeur sur le marché.

Je recommande l'option 2, plus sympathique, sans risque pour l'économie.

## 8. Ordre de réalisation proposé

1. ✅ **Comptes et collection serveur** : connexion, profil, collection en exemplaires, boosters tirés par le serveur, import « souvenir ». Le jeu solo actuel continue de fonctionner, mais sauvegardé en ligne.
2. **Échanges directs et souhaits partagés** : offres entre joueurs, suggestions doublons ↔ souhaits, profils publics avec vitrine.
3. **Hôtel des ventes** : enchères, achat immédiat, frais, historique des prix.
4. **Clans** : création, coffre, objectifs, classement.
5. **Duels entre joueurs** : matchmaking, Realtime, elo, saisons.
6. **Bourse** : carnets d'ordres, une fois qu'il y a assez de joueurs.

Pour préparer l'étape 1 sans casser le jeu actuel, le code peut dès maintenant passer par une interface de dépôt (`ouvrirBooster`, `recycler`, `modifierEquipe`…) avec deux implémentations : locale (l'actuelle) et en ligne (Supabase).

## 9. Questions à trancher

- Quels modes de connexion : Discord, Google, e-mail ?
- Âge minimum, et argent réel un jour ou jamais ?
- Combien de joueurs visés au lancement ? La bourse et les clans n'ont de sens qu'au-delà de quelques centaines de joueurs actifs.
- Faut-il garder le nom « SCP Masters » ? Il ne doit pas laisser croire à un produit officiel de la Fondation SCP ou de WikiMasters.
