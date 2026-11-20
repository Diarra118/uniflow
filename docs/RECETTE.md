# Recette UniFlow — déploiement sur un projet Firebase séparé

Les § 1 à 7 décrivent une procédure **préparée, non exécutée**, qui cible
un projet Firebase de recette distinct de la production. Le § 0 décrit, lui,
le déploiement **réalisé** de la version hébergée de démonstration, sans
Cloud Functions. Aucune valeur secrète ne figure ici.

> **État au 20/11/2026 :** version hébergée de démonstration en ligne sur
> https://uniflow-demo-30e61.web.app, sur le plan gratuit Spark et sans
> Cloud Functions (§ 0). La recette complète, avec les fonctions (§ 1 à 7),
> reste à faire, pour les raisons ci-dessous.
>
> **État au 17/11/2026 : recette en ligne non réalisée, reste à faire.**
> Elle exige le **plan Blaze** (paiement à l'usage, § 2) : Cloud Functions
> de 2ᵉ génération et appels sortants pour les invitations. Le projet n'a
> pas ce plan aujourd'hui. En attendant, la démonstration se fait en local
> sur émulateurs (`npm run demo`, README « Lancer UniFlow (jury) »), où le
> déclencheur `onUserProfileWritten` s'exécute aussi (région `us-central1`
> sous l'émulateur uniquement). Les tests R0 à R7 (§ 6) restent à passer
> sur un vrai projet : région `europe-west1`, runtime Node 22, App Check,
> e-mails réels et révocation effective des refresh tokens (que l'émulateur
> Auth ne contrôle pas).

> ⚠️ **Identifiant du projet.** Le dépôt est public : `.firebaserc` ne
> désigne que le projet **fictif** `demo-uniflow`, celui des émulateurs.
> Aucun identifiant de projet réel n'est versionné. L'identifiant réel
> (recette ou production) se configure **uniquement sur votre poste** :
>
> - de préférence, en le passant à chaque commande :
>   `--project <ID_RECETTE>` (c'est le cas de toutes les commandes
>   ci-dessous) ;
> - ou avec `firebase use <ID_RECETTE>`, qui l'enregistre dans la
>   configuration locale de la CLI Firebase (hors du dépôt) ; `firebase use`
>   affiche alors ce projet pour ce dossier.
>
> N'utilisez pas `firebase use --add` : il écrit l'alias dans
> `.firebaserc`, fichier versionné. Si vous l'avez fait, annulez avec
> `git checkout -- .firebaserc` avant tout commit.
>
> Les autres valeurs réelles vivent aussi dans des fichiers locaux exclus de
> Git : `.env.local` / `.env.recette.local` (front) et
> `functions/.env.<ID_RECETTE>` (Cloud Functions), voir § 3.
>
> Sans `--project` ni `firebase use`, une commande vise `demo-uniflow`, qui
> n'existe pas en ligne : un `firebase deploy` oublié échoue au lieu de
> toucher un vrai projet.

Dans ce document, `<ID_RECETTE>` désigne l'identifiant du projet de recette
(par exemple `uniflow-recette`), et `<URL_RECETTE>` l'adresse où le front
sera servi.

---

## 0. Version hébergée de démonstration (plan Spark, sans Cloud Functions)

Déploiement **réalisé le 20/11/2026** sur le projet `uniflow-demo-30e61`,
réservé à la démonstration (données fictives), sur le plan gratuit Spark.
Adresse : **https://uniflow-demo-30e61.web.app**.

Le plan Spark ne permet pas les Cloud Functions : seuls Hosting,
Authentication et Realtime Database sont utilisés. Ce qui fonctionne en
ligne, ce qui demande la version locale et pourquoi : voir README,
« Version en ligne ».

### 0.1 Ce que le dépôt prévoit pour ce mode

| Élément | Rôle |
|---|---|
| `VITE_FUNCTIONS_ENABLED` (`src/core/config/features.ts`) | Vraie par défaut, donc en local. À `false`, l'interface masque tout ce qui appelle une fonction et affiche « Disponible dans la version complète, à lancer en local : voir le README. » Aucun appel de fonction n'est tenté. |
| App Check (`src/core/firebase/config.ts`) | Facultatif : sans clé de site, il n'est pas initialisé. |
| `firebase.json`, section `hosting` | `dist/`, toutes les routes vers `index.html`, cache long sur `/assets/**`, `no-cache` ailleurs, en-têtes de sécurité de base. Le `predeploy` lance `npm run build:hosted`. |
| `.env.hosted` (non versionné, modèle : `.env.hosted.example`) | Configuration web **publique** du projet de démo, avec `VITE_FUNCTIONS_ENABLED=false` et une clé App Check vide. |
| `npm run build:hosted` (`scripts/build-hosted.mjs`) | Build en mode `hosted`. Refuse un autre projet, ou une clé de `.env.local` absente de `.env.hosted` (pour éviter toute fuite de la configuration habituelle). Vérifie ensuite le bundle. |
| `npm run seed:hosted` (`functions/scripts/seedHosted.ts`) | Fait avec l'Admin SDK ce que font les fonctions : comptes, profils actifs, claims `role` et `universityId`, fiches liées, index des universités, sur le jeu de la démo locale. Refuse tout autre projet que `uniflow-demo-30e61`. Mots de passe aléatoires écrits uniquement dans `docs/COMPTES-EN-LIGNE.local.md` (non versionné). |
| `npm run test:en-ligne` (`tests/audit/en-ligne.test.mjs`) | Vérification Playwright de l'adresse en ligne (§ 0.3). |

La clé du compte de service reste **hors du dépôt**. Elle est transmise
par la variable `GOOGLE_APPLICATION_CREDENTIALS`, jamais copiée ni
affichée. `.firebaserc` ne contient toujours que `demo-uniflow` : chaque
commande précise `--project uniflow-demo-30e61`.

### 0.2 Procédure suivie (Git Bash, racine du dépôt)

```bash
# Clé hors du dépôt, pour la session de terminal uniquement
export GOOGLE_APPLICATION_CREDENTIALS='C:\Users\<vous>\cles\uniflow-demo.json'

# 1. Configuration web publique du projet de démo, recopiée dans .env.hosted
npx firebase apps:list --project uniflow-demo-30e61
npx firebase apps:sdkconfig web <APP_ID> --project uniflow-demo-30e61

# 2. Contrôles locaux : suites sur émulateurs (voir README « Développement »)

# 3. Règles de la base et site (le predeploy construit dist/ avec .env.hosted)
npx firebase deploy --only database,hosting --project uniflow-demo-30e61

# 4. Données de démonstration et comptes (relançable : remet les données
#    de démo à zéro et donne de nouveaux mots de passe)
npm run seed:hosted

# 5. Vérification en ligne
npm run test:en-ligne
```

Avant le déploiement, la base de démo était vide, avec les règles
`{".read": false, ".write": false}`. Le fournisseur E-mail/Mot de passe
était déjà activé, et les domaines `uniflow-demo-30e61.web.app` et
`uniflow-demo-30e61.firebaseapp.com` déjà autorisés.

### 0.3 Vérifications réalisées

- En-têtes en production (`curl -sI`) : `/`, `/login` et `/app/programs`
  répondent 200 (index.html) avec `Cache-Control: no-cache`.
  `/assets/*.js` répond avec `public, max-age=31536000, immutable`.
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy` et HSTS sont présents.
- `npm run test:en-ligne` : **16/16**. Connexion des 9 comptes, chacun
  sur le bon tableau de bord. Chiffres de l'admin Horizon. Isolation :
  l'admin Baobab ne voit aucune donnée d'Horizon dans l'interface, et sa
  lecture directe de `universities/universite-horizon/*` est refusée (401).
  Filière de test créée, modifiée puis supprimée. Message affiché à la
  place des fonctions désactivées (connexion, inscription, demandes,
  fiche, formulaire). Rechargement d'une route interne. Mode sombre et
  390 px. Console sans erreur ni lecture refusée, aucun appel de fonction.
  Captures : `tests/audit/out/en-ligne/` (non versionné).

### 0.4 Retour arrière

| Quoi | Commande ou action |
|---|---|
| Site : version précédente | Console Firebase > Hosting > Historique des versions > « Restaurer » sur la version voulue. |
| Site : mise hors ligne | `npx firebase hosting:disable --project uniflow-demo-30e61` (un nouveau `deploy` le remet en ligne). |
| Règles de la base | Console > Realtime Database > Règles : recoller `{"rules": {".read": false, ".write": false}}` puis Publier. Autre possibilité : `npx firebase deploy --only database --project uniflow-demo-30e61` depuis une version antérieure du dépôt. |
| Mots de passe divulgués | `npm run seed:hosted` : nouveaux mots de passe pour tous les comptes de démo, données de démo remises à zéro. |
| Données et comptes | Console > Realtime Database : supprimer `universities`, `users` et `platform`. Console > Authentication : supprimer les comptes `*.test`. |
| Code | La version locale n'est pas modifiée par ce mode (`VITE_FUNCTIONS_ENABLED` vaut vrai par défaut). Revenir au tag précédent : `git checkout <tag>`. |

Ce mode ne touche ni aux Cloud Functions, ni à `.firebaserc`, ni à aucun
autre projet Firebase.

---

## 1. Configuration à créer

1. **Projet** : console Firebase > Ajouter un projet > `<ID_RECETTE>`
   (Google Analytics facultatif). Projet distinct de la production.
2. **Realtime Database** : Créer une base > emplacement **Belgique
   (`europe-west1`)**, mode verrouillé.
   - Obligatoire : le déclencheur `onUserProfileWritten` est déployé en
     `europe-west1` et ne se déclenche que si la base est dans la **même
     région**. L'emplacement de l'instance par défaut ne peut plus être
     changé après sa création.
   - URL attendue : `https://<ID_RECETTE>-default-rtdb.europe-west1.firebasedatabase.app`.
3. **Authentication** : Commencer > fournisseur **E-mail/Mot de passe**
   activé (sans lien e-mail). Paramètres > Domaines autorisés : ajouter le
   domaine de `<URL_RECETTE>`.
4. **Application web** : Paramètres du projet > Vos applications > Web.
   Récupérer la configuration publique (valeurs `VITE_FIREBASE_*`).
5. **Hébergement du front** : `firebase.json` ne contient **aucune section
   `hosting`**. Choisir où servir `dist/` pour la recette (Firebase Hosting
   après ajout d'une section `hosting`, ou un autre hébergement statique),
   puis fixer `<URL_RECETTE>`. Décision à prendre avant la recette.
6. **Projet actif local** (facultatif) : `firebase use <ID_RECETTE>`
   (enregistré hors du dépôt, voir l'encadré en tête). Continuer malgré
   tout à passer `--project` explicitement.

## 2. Plan Firebase et alerte de budget

- **Plan Blaze (paiement à l'usage) requis** : Cloud Functions de 2ᵉ
  génération, et appels sortants vers Identity Toolkit pour les
  invitations. Le plan Spark ne permet pas de déployer les fonctions.
- **Alerte de budget**, à créer **avant** tout déploiement : console Google
  Cloud > Facturation > Budgets et alertes > Créer un budget limité au
  projet `<ID_RECETTE>` (par exemple 10 €), avec des seuils à 50 %, 90 % et
  100 % et des e-mails aux administrateurs de facturation.
  - Une alerte **ne plafonne pas** la dépense : elle prévient seulement.
- Lors du premier `firebase deploy --only functions --project <ID_RECETTE>`, la CLI propose une
  politique de nettoyage des images Artifact Registry : l'accepter (par
  exemple 1 jour) pour éviter des frais de stockage.

## 3. Variables nécessaires (aucune valeur ici)

| Où | Fichier (non versionné) | Variables |
|---|---|---|
| Front, build de recette | `.env.recette.local` (utilisé par `vite build --mode recette`) | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (configuration publique du projet de recette), `VITE_FIREBASE_APPCHECK_SITE_KEY`, `VITE_USE_EMULATORS=false` |
| Functions | `functions/.env.<ID_RECETTE>` (lu par `firebase deploy`) | `WEB_API_KEY` (clé web publique du projet de recette), `APP_LOGIN_URL` (`<URL_RECETTE>/login`) |
| Premier administrateur (script hors dépôt) | variables d'environnement du terminal | `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT`, `TEST_USER_PASSWORD` |

- Les fichiers `.env.*` sont exclus de Git (`.gitignore` racine et
  `functions/`). Vérifier avec `git status` qu'aucun n'apparaît.
- Le script local `create-test-user.js` (hors dépôt, non publié) prend
  **par défaut** les identifiants de la **production** si
  `FIREBASE_PROJECT_ID` et `FIREBASE_DATABASE_URL` ne sont pas définis :
  les définir **explicitement** pour la recette.
- La clé de compte de service de recette (`FIREBASE_SERVICE_ACCOUNT`) ne doit
  jamais être enregistrée dans le dépôt. La générer pour l'opération, puis la
  supprimer (console Google Cloud > IAM > Comptes de service > Clés).

## 4. App Check et e-mails

**App Check**
1. Console Google Cloud > Sécurité > reCAPTCHA : créer une clé de site
   **reCAPTCHA Enterprise** (type site web) pour le domaine de
   `<URL_RECETTE>`.
2. Console Firebase > App Check > Applications > application web :
   enregistrer le fournisseur reCAPTCHA Enterprise avec cette clé. Reporter
   la clé de site dans `VITE_FIREBASE_APPCHECK_SITE_KEY`.
3. Les callables `createUserAccount` et `resendAccountInvite` exigent App
   Check (`enforceAppCheck`). Pour Realtime Database et Authentication,
   commencer en **surveillance** (sans application forcée) pendant la
   recette, et ne l'imposer qu'après lecture des métriques.
4. Testeurs en local contre la recette : jetons de débogage (App Check >
   Applications > Gérer les jetons de débogage), avec
   `VITE_FIREBASE_APPCHECK_DEBUG=true` côté front.

**E-mails**
1. Authentication > Modèles > Réinitialisation du mot de passe : langue
   **Français**, objet et message repris du README (section « Modèle
   d'e-mail »). Ce modèle sert à l'invitation **et** à « Mot de passe
   oublié ».
2. Le domaine de `APP_LOGIN_URL` doit figurer dans les domaines autorisés,
   sinon l'envoi échoue (`INVALID_CONTINUE_URI`).
3. Utiliser des adresses de test réelles et contrôlées (boîtes de l'équipe).

## 5. Déploiement (projet de recette ciblé explicitement)

La CLI Firebase est une dépendance du projet (`npm run setup`) : sans
installation globale, préfixez les commandes `firebase` par `npx`.

```bash
# 0. Point de départ traçable
git switch main && git pull --ff-only     # ou la branche à recetter
git tag recette-AAAAMMJJ                    # repère pour le retour arrière

# 1. Contrôles avant déploiement (émulateurs uniquement)
npm run doctor
npm ci && npm --prefix functions ci
npx tsc -b && npm run build && npm run lint
npm --prefix functions test
npm run test:rules && npm run test:integration && npm run test:e2e
npm run test:session && npm run test:revocation && npm run test:audit

# 2. Vérifier la cible
firebase projects:list
firebase use                                # demo-uniflow, ou le projet choisi localement

# 3. Règles puis fonctions, sur la RECETTE uniquement
firebase deploy --only database  --project <ID_RECETTE>
firebase deploy --only functions --project <ID_RECETTE>

# 4. Front de recette
npx vite build --mode recette               # lit .env.recette.local
# puis publication de dist/ sur <URL_RECETTE> (voir § 1.5)
```

Après le déploiement :
`firebase functions:list --project <ID_RECETTE>`. Les trois fonctions
doivent apparaître en `europe-west1`.

Premier administrateur : soit avec `create-test-user.js` et les variables du
§ 3, soit à la main (voir le test R1 ci-dessous), puis créer
`/universities/{universityId}/meta`.

## 6. Tests de `onUserProfileWritten` (déployé en `europe-west1`)

En local, le déclencheur s'exécute sous l'émulateur avec la région
`us-central1` (`npm run test:audit:server`). La recette vérifie son
fonctionnement réel en `europe-west1`, avec la base de la même région.

Suivi des exécutions :
`firebase functions:log --only onUserProfileWritten --project <ID_RECETTE>`,
ou la console Cloud Functions > Journaux.

| # | Test | Étapes | Résultat attendu |
|---|---|---|---|
| R0 | Runtime et région | `firebase functions:list --project <ID_RECETTE>` ; ou `gcloud functions describe onUserProfileWritten --region europe-west1 --project <ID_RECETTE> --format="value(buildConfig.runtime)"` | Runtime **`nodejs22`** pour les 3 fonctions, région `europe-west1` |
| R1 | Création manuelle d'un profil | 1) Authentication : créer un utilisateur. 2) Realtime Database : créer `/users/{uid}` avec `uid, email, name, role: "admin_universite", universityId, status: "active", createdAt`. 3) Se connecter sur `<URL_RECETTE>/login`. | Journal : « Claims mis à jour pour {uid} ». Connexion réussie et navigation administrateur affichée. |
| R2 | Profil en attente | Créer `/users/{uid2}` avec `status: "pending"` pour un autre utilisateur, puis tenter de se connecter. | Journal : « Profil … en attente — claims non posés ». Écran « compte en cours d'activation ». |
| R3 | Suspension | Avec un utilisateur **connecté** sur une liste : passer `/users/{uid}/status` à `"suspended"`. | Journal : « Claims retirés et sessions révoquées ». Données coupées **immédiatement** (règles) et déconnexion avec un message. Une nouvelle connexion n'ouvre aucun accès. |
| R4 | Réactivation | Repasser `status` à `"active"`, puis se reconnecter. | Claims reposés, accès rétabli. |
| R5 | Changement de rôle | Passer `role` de `"teacher"` à `"student"` pendant que l'utilisateur est connecté. | Ancien accès coupé immédiatement. Après mise à jour des claims par le déclencheur, l'interface bascule vers la navigation étudiant. |
| R6 | Suppression du profil | Supprimer `/users/{uid}`. | Journal : « Claims retirés … (profil supprimé) ». Utilisateur déconnecté. |
| R7 | Parcours complet | Depuis l'interface admin : créer un enseignant et un étudiant avec accès, recevoir les e-mails, définir les mots de passe, se connecter. | Identique au test `npm run test:e2e`, avec les vrais e-mails et App Check actif. |

Consigner pour chaque test : date, testeur, résultat, et extrait du journal
(sans données personnelles).

## 7. Retour arrière

Préparer **avant** le déploiement :
- le tag Git `recette-AAAAMMJJ` (§ 5) et le tag de la version précédente ;
- un export des données de recette :
  `firebase database:get / --project <ID_RECETTE> > sauvegarde-recette.json`
  (fichier contenant des données : à ne pas versionner).

Procédures :
1. **Règles** : `git checkout <tag-précédent> -- database.rules.json`, puis
   `firebase deploy --only database --project <ID_RECETTE>`, puis
   `git checkout HEAD -- database.rules.json` pour revenir à l'état courant.
2. **Fonctions** : depuis un worktree du tag précédent,
   `firebase deploy --only functions --project <ID_RECETTE>`. Pour retirer
   une fonction ajoutée :
   `firebase functions:delete <nom> --region europe-west1 --project <ID_RECETTE>`.
   Le runtime nodejs20 est retiré : une version antérieure doit elle aussi
   viser Node 22.
3. **Données** : restauration ciblée avec
   `firebase database:set <chemin> sauvegarde.json --project <ID_RECETTE>`
   (écrase le chemin : vérifier deux fois la cible et le projet).
4. **Front** : republier le `dist/` du tag précédent.
5. **Accès d'urgence** : suspendre un compte en passant
   `/users/{uid}/status` à `"suspended"` (effet immédiat par les règles),
   ou le désactiver dans Authentication.

La production n'est jamais concernée par ces commandes : vérifier
`--project <ID_RECETTE>` à chaque ligne.
