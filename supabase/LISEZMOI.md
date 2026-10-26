# Mise en place de Supabase

Le jeu se joue uniquement en ligne : sans les variables `VITE_SUPABASE_*`, il affiche « Serveur non configuré ».

Projet en service : `mwsoqzrpgghwtiazuios` (région eu-west), relié au site https://scp-masters.vercel.app.

## 1. Créer le projet

1. Sur [supabase.com](https://supabase.com), créez un projet gratuit en région **Europe (eu-west)**.
2. Notez l'URL du projet et la clé publique (**Project Settings → API**).

## 2. Créer les tables et les fonctions

Le plus simple, sans rien installer : dans **SQL Editor**, collez puis exécutez dans l'ordre :

1. `supabase/migrations/20261026120000_comptes_et_collection.sql`
2. `supabase/catalogue.sql` (17 320 cartes)

Avec la ligne de commande Supabase, l'équivalent est :

```bash
npx supabase login
```

```bash
npx supabase link --project-ref VOTRE_REF
```

```bash
npx supabase db push --include-seed
```

Si `db push` échoue sur « Connection timed out », le réseau bloque les ports Postgres (5432 et 6543) : c'est le cas sur le réseau du bureau. Le SQL Editor passe par HTTPS et fonctionne, lui. Dans ce cas, collez la migration puis le catalogue dans le SQL Editor. `supabase/.temp/a-coller-dans-sql-editor.sql` contient les deux à la suite.

`--include-seed` charge aussi `supabase/catalogue.sql` (déclaré comme seed dans `config.toml`). Après chaque `npm run cartes`, relancez `npm run catalogue-sql` puis la même commande : le catalogue met à jour les cartes existantes sans rien supprimer.

## 3. Régler la connexion

Les adresses autorisées sont dans `config.toml` (`site_url`, `additional_redirect_urls`). On les pousse avec `npx supabase config push`, qui passe par HTTPS et fonctionne donc aussi sur le réseau du bureau. Attention : la commande pousse tout le fichier. Les autres réglages d'authentification y sont alignés sur ceux du projet ; vérifiez le diff qu'elle affiche avant de répondre « y ».

À la main, c'est dans **Authentication → URL Configuration** :

- **Site URL** : l'adresse du jeu en production (par exemple `https://scp-masters.vercel.app`).
- **Redirect URLs** : ajoutez aussi `http://localhost:5191` pour le développement.

La connexion par lien e-mail fonctionne tout de suite. Le service d'e-mail intégré de Supabase est limité à quelques envois par heure : pour un vrai lancement, branchez un SMTP (**Authentication → SMTP Settings**).

Pour Discord ou Google, activez le fournisseur dans **Authentication → Providers**, puis ajoutez-le dans `VITE_SUPABASE_FOURNISSEURS`.

## 4. Brancher le jeu

Copiez `.env.example` en `.env.local` et remplissez l'URL et la clé, puis :

```bash
npm run dev
```

Sur Vercel, ajoutez les mêmes variables dans **Settings → Environment Variables**, puis redéployez.

## 5. Vérifier

`npm run test-sql` rejoue les migrations dans un Postgres embarqué et vérifie les règles du serveur : tirages, crédits, droits d'accès, recyclage, import, duels. Aucun compte Supabase n'est nécessaire pour lancer ces tests.
