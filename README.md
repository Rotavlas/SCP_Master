# SCP Masters

Jeu de cartes à collectionner inspiré de WikiMasters, construit sur le wiki SCP : 17 320 fiches deviennent des cartes.

| Type | Cartes | Source |
|---|---|---|
| SCP (séries 1 à 10) | 9 750 | export scp-data |
| Contes (note ≥ 10) | 6 349 | export scp-data |
| Documents de Groupes d'intérêt | 806 | export scp-data |
| Personnel et Conseil O5 | 200 | dossier du personnel, dossier O5 |
| Équipes FIM | 106 | page des Mobile Task Forces |
| Canons | 58 | Canon Hub |
| Groupes d'intérêt | 51 | page des Groupes d'intérêt |

- **Boosters** : un dossier standard gratuit toutes les 10 minutes (10 en stock maximum). L'intendance vend des dossiers thématiques (anomalies, archives narratives, personnel) et premium (Keter, Conseil O5). Ouverture en trois temps : on déchire le scellé, on retourne les cartes une à une (la plus belle en dernier, avec effets selon la rareté), puis bilan en éventail.
- **Variantes rares** : chaque carte tirée peut sortir holographique, expurgée, en archive d'origine, en brèche ou avec le sceau O5. Elles sont visuelles et se collectionnent à part.
- **Rareté** selon la popularité, classée à l'intérieur de chaque type. Pour les pages notées : la note du wiki, les pages qui les citent, les hubs. Pour les fiches de référence (FIM, personnel, GdI, canons) : les pages qui leur sont liées ou qui les citent dans leur texte, chacune comptant selon sa note. Paliers : légendaire 1 %, épique 4 %, rare 10 %, peu commune 25 %, commune 60 %. Les fiches de référence, moins nombreuses, ont des paliers plus larges : légendaire 4 %, épique 8 %, rare 15 %, peu commune 28 %, commune 45 %. MTF Epsilon-11 et l'Insurrection du Chaos sont légendaires d'office.
- **Répertoire** : la liste complète de ce qui s'obtient, avec la progression par type, les variantes possédées, les boosters où chaque fiche peut tomber et une liste de souhaits.
- **VO / VF** : les textes passent aux traductions de la branche française (fondationscp.wikidot.com) quand elles existent, soit environ 3 200 fiches. Le reste reste en anglais.
- **Confrontations** : 5 manches de quiz contre une IA. Les questions s'adaptent au type de carte : classe, surnom, document caviardé, fonction d'un membre du personnel, genre d'un conte, anomalie confinée par une FIM…

## En ligne uniquement

Le jeu se joue sur **https://scp-masters.vercel.app**, avec un compte : connexion par lien e-mail (ou code), sans mot de passe. Il n'y a plus de partie hors ligne : la collection, les crédits et la progression vivent sur le serveur Supabase, qui tire lui-même les boosters et calcule les récompenses.

- Chaque carte obtenue est un exemplaire unique avec son numéro de série.
- Les duels contre l'IA sont arbitrés par le serveur (fonction Edge `supabase/functions/duel`) : il tire le deck de l'IA et les questions, ne révèle la bonne réponse qu'après la réponse du joueur, chronomètre, fait répondre l'IA et calcule dégâts, issue et récompense (30 duels récompensés par jour).
- Aucune carte ne vient du navigateur : l'import de l'ancienne partie hors ligne a été retiré, car son contenu était modifiable à volonté.
- Le navigateur n'écrit dans aucune table et n'appelle que les fonctions du jeu, qui ne construisent jamais de SQL à partir du texte reçu. Le site envoie des en-têtes de sécurité stricts (CSP, interdiction d'affichage dans un cadre).
- Chaque joueur peut supprimer son compte depuis l'intendance.

Mise en place du serveur : [supabase/LISEZMOI.md](supabase/LISEZMOI.md). Étapes suivantes (échanges, enchères, bourse, clans, duels entre joueurs) : [docs/en-ligne.md](docs/en-ligne.md).

```bash
npm run test-sql
```

Cette commande vérifie toutes les règles du serveur dans un Postgres embarqué, sans compte Supabase.

## Déploiement

Projet Vercel `scp-masters` de l'espace `rotavlas`. Les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` y sont configurées.

```bash
vercel deploy --prod --yes --scope rotavlas
```

## Développement

Copiez `.env.example` en `.env.local` (URL et clé publique du projet Supabase), puis :

```bash
npm install
npm run dev
```

## Mettre à jour les cartes

Les fichiers bruts (environ 1 Go) ne sont pas versionnés.

```bash
powershell -File outils/telecharger_donnees.ps1 C:\chemin\scpdata
npm run fr -- C:\chemin\scpdata
npm run cartes -- C:\chemin\scpdata
```

`npm run fr` aspire les pages traduites de la branche française, environ 3 100 pages, avec une pause entre chaque requête. Le cache rend la commande reprenable. `npm run cartes` régénère `public/data/cards.json` et `public/data/cards.fr.json`.

## Licence du contenu

Les textes et images proviennent du [SCP Wiki](https://scp-wiki.wikidot.com) et de la [branche française](https://fondationscp.wikidot.com), sous licence [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Chaque fiche cite son auteur et renvoie vers la page d'origine. Jeu de fan non officiel.
