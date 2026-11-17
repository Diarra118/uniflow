# Recette UniFlow — déploiement sur un projet Firebase séparé

Procédure **préparée, non exécutée**. Elle cible un projet Firebase de
recette distinct de la production. Aucune valeur secrète ne figure ici.

> **État au 17/11/2026 : recette en ligne non réalisée, reste à faire.**
> Elle exige le **plan Blaze** (paiement à l'usage, § 2) : Cloud Functions
> de 2ᵉ génération et appels sortants pour les invitations. Le projet n'a
> pas ce plan aujourd'hui. En attendant, la démonstration se fait en local
> sur émulateurs (`npm run demo`, README « Lancer la démo »), où le
> déclencheur `onUserProfileWritten` s'exécute aussi (région `us-central1`
> sous l'émulateur uniquement). Les tests R0 à R7 (§ 6) restent à passer
> sur un vrai projet : région `europe-west1`, runtime Node 22, App Check,
> e-mails réels et révocation effective des refresh tokens (que l'émulateur
> Auth ne contrôle pas).

> ⚠️ `.firebaserc` désigne le projet de **production** comme projet par
> défaut. Toutes les commandes ci-dessous passent donc **explicitement**
> `--project <ID_RECETTE>`. N'exécutez jamais `firebase deploy` sans cette
> option.

Dans ce document, `<ID_RECETTE>` désigne l'identifiant du projet de recette
(par exemple `uniflow-recette`), et `<URL_RECETTE>` l'adresse où le front
sera servi.

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
6. **Alias local** (facultatif, sans changer le défaut) :
   `firebase use --add` puis choisir `<ID_RECETTE>` avec l'alias `recette`.
   Vérifier ensuite que `firebase use` affiche toujours la production par
   défaut, et continuer à passer `--project` explicitement.

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
- `create-test-user.js` (dossier parent du dépôt) prend **par défaut** les
  identifiants de la **production** si `FIREBASE_PROJECT_ID` et
  `FIREBASE_DATABASE_URL` ne sont pas définis : les définir
  **explicitement** pour la recette.
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

```bash
# 0. Point de départ traçable
git switch main && git pull --ff-only     # ou la branche à recetter
git tag recette-AAAAMMJJ                    # repère pour le retour arrière

# 1. Contrôles avant déploiement (émulateurs uniquement)
npm ci && npm --prefix functions ci
npx tsc -b && npm run build && npm run lint
npm --prefix functions test
npm run test:rules && npm run test:integration && npm run test:e2e
npm run test:session && npm run test:revocation && npm run test:audit

# 2. Vérifier la cible
firebase projects:list
firebase use                                # doit rester la PRODUCTION par défaut

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
