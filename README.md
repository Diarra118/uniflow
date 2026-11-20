# UniFlow — gestion universitaire multi-établissements

## Version en ligne (démonstration)

**Adresse : https://uniflow-demo-30e61.web.app**

Projet Firebase réservé à la démonstration, avec des données fictives : deux
universités (Horizon et Baobab), leurs filières, cours, classes,
enseignants, étudiants et un parent. Les identifiants ne sont pas publiés
dans ce dépôt public : ils sont communiqués séparément.

| Fonctionne en ligne | Demande la version locale |
|---|---|
| Connexion des rôles admin d'université, enseignant, étudiant et parent, avec le tableau de bord de chacun | Création d'un compte depuis la page de connexion (auto-inscription) |
| Listes et fiches des étudiants et des enseignants : création, modification, activation | Validation ou refus des demandes d'inscription |
| Filières, cours et classes : création et modification | Création d'un accès de connexion depuis une fiche, avec l'envoi ou le renvoi de l'invitation |
| Isolation des universités, appliquée par les règles de sécurité de la base | Déclencheurs serveur : pose automatique des droits (custom claims) et révocation des sessions d'un compte suspendu |
| Mode sombre et affichage mobile | |

**Pourquoi ?** La version en ligne utilise le plan gratuit Spark de
Firebase, qui ne permet pas de déployer les **Cloud Functions**. Or les
actions de la colonne de droite passent volontairement par ces fonctions
serveur : le navigateur ne peut jamais attribuer un rôle ni créer un
compte lui-même. En ligne, ces actions affichent « Disponible dans la
version complète, à lancer en local : voir le README. » Les comptes de
démonstration y ont été créés par un script local (`npm run seed:hosted`),
qui fait ce que feraient les fonctions. La version locale ci-dessous
contient tout, Cloud Functions comprises (émulées). Procédure de
déploiement et retour arrière : [docs/RECETTE.md](docs/RECETTE.md#0-version-hébergée-de-démonstration-plan-spark-sans-cloud-functions).

## Lancer UniFlow (jury)

UniFlow est une plateforme de gestion universitaire où chaque université
gère ses étudiants, enseignants, filières, cours et classes, avec un espace
propre à chaque rôle. Elle fonctionne **entièrement en local, sur les
émulateurs Firebase** : aucun compte Firebase, aucune clé à renseigner,
aucune connexion à un service payant.

**Vidéo de démonstration** : [https://youtu.be/clEUiUahWw0]

### Prérequis

| Outil | Version | Téléchargement |
|---|---|---|
| Node.js | **22** (LTS) | https://nodejs.org/fr/download |
| Java | **17 ou plus** (21 conseillé) | https://adoptium.net/temurin/releases/?version=21 |

Une connexion internet est nécessaire la première fois (dépendances et
émulateurs ; prévoir environ 1 Go d'espace disque). Ensuite, la démo
fonctionne aussi hors ligne.
Pour récupérer le code sans Git : bouton **Code > Download ZIP** sur
GitHub, puis ouvrez un terminal dans le dossier décompressé (étape 2).

### Commandes, dans l'ordre

```bash
git clone https://github.com/Diarra118/uniflow.git
cd uniflow
npm run doctor   # vérifie Node et Java ; indique quoi installer s'ils manquent
npm run setup    # installe les dépendances (une seule fois, 2 à 5 minutes)
npm run demo     # démarre UniFlow : prêt quand « Démo UniFlow prête » s'affiche
```

Puis ouvrez **http://localhost:5173**. Le premier démarrage prend 1 à
3 minutes ; les suivants, environ 40 secondes.

- **Arrêter** : `Ctrl+C` dans le terminal. Les données sont sauvegardées
  et retrouvées au prochain `npm run demo`.
- **Repartir de zéro** : `npm run demo:reset` (jeu de démo recréé,
  nouveaux mots de passe), qui démarre ensuite la démo.

> **Pourquoi `npm run demo` et pas `npm run dev` ?**
> - `npm run dev` ne lance que l'interface : seule, elle ne permet ni de se connecter, ni de créer un compte.
> - UniFlow s'appuie sur un serveur Firebase : authentification, base de données, règles de sécurité, et Cloud Functions qui attribuent les rôles et valident les inscriptions.
> - `npm run demo` démarre ce serveur en local grâce aux émulateurs Firebase, charge les règles et les données de démonstration, puis lance lui-même l'interface.
> - Tout se teste ainsi gratuitement, sans compte Firebase ni service payant, avec les mêmes règles de sécurité qu'en production. Le déploiement en ligne est décrit dans [docs/RECETTE.md](docs/RECETTE.md).

### Comptes de démonstration

Les comptes sont **créés sur votre machine** au premier `npm run demo`.
Leurs mots de passe, tirés au hasard à ce moment-là, sont écrits dans le
fichier **`docs/COMPTES-DEMO.local.md`** de votre copie du projet. Ils
n'existent que dans les émulateurs de votre poste : **aucun mot de passe
n'est publié dans ce dépôt**.

| Rôle | E-mail de connexion | Ce qu'on peut voir |
|---|---|---|
| Admin d'université | `admin@horizon.test` | Tableau de bord, toutes les listes, création des accès, validation des inscriptions |
| Enseignant | `moussa.traore@horizon.test` | Ses cours, listes en lecture seule |
| Étudiante | `awa.diallo@horizon.test` | « Mon dossier », accès aux listes refusé |
| Parent | `mamadou.diallo@horizon.test` | Espace parent, enfant rattaché |
| Admin d'une autre université | `admin@baobab.test` | Uniquement les données de l'Institut Baobab (isolation) |

Le fichier liste aussi les autres comptes (9 au total, sur deux
universités fictives). Pour passer d'un compte à l'autre :
**Se déconnecter** (menu en haut à droite), ou une fenêtre de navigation
privée pour un second compte en parallèle.

### Tester l'inscription d'un nouveau compte

1. Dans une **fenêtre de navigation privée**, ouvrez http://localhost:5173
   puis **Créer un compte**.
2. Remplissez : prénom, nom, une adresse inventée (par exemple
   `nouvel.etudiant@horizon.test`), un mot de passe d'au moins
   8 caractères (deux fois), université **Université Horizon**, rôle
   **Étudiant**, puis **Envoyer ma demande**. L'écran « Demande en
   attente » s'affiche : le compte n'a encore accès à rien.
3. Dans la fenêtre normale, connectez-vous avec `admin@horizon.test`,
   ouvrez **Inscriptions** (le compteur indique 1), cliquez **Valider** sur
   la demande, saisissez un matricule (par exemple `HZ-2026-100`), puis
   **Valider**.
4. Sans recharger, la fenêtre privée bascule d'elle-même dans l'espace
   étudiant (« Mon dossier »). Le bouton **Refuser** fonctionne de la même
   façon, avec un motif affiché à la personne.

Un parcours complet de 10 minutes (création d'un accès par l'admin,
suspension en direct, isolation entre universités, mode sombre) est
détaillé dans [docs/DEMO-SOUTENANCE.md](docs/DEMO-SOUTENANCE.md).

### Problèmes fréquents

| Problème | Solution |
|---|---|
| `npm run doctor` : **Java introuvable** | Installez Java 21 (lien ci-dessus ; Windows : `winget install EclipseAdoptium.Temurin.21.JDK`), **fermez et rouvrez le terminal**, relancez `npm run doctor`. Un JDK installé ailleurs : définissez `JAVA_HOME`. |
| `npm run doctor` : **mauvaise version de Node** | Installez Node 22 (lien ci-dessus). Avec nvm : `nvm install 22` puis `nvm use 22`. |
| Windows PowerShell : « l'exécution de scripts est désactivée » | Lancez les commandes dans l'**Invite de commandes** (`cmd`), ou une fois : `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. |
| « Dépendances absentes » | Lancez `npm run setup`, puis `npm run demo`. |
| **Port occupé** (« Port 5173 is already in use », « port taken ») | Une démo tourne déjà : fermez-la (`Ctrl+C` dans son terminal). Sinon, trouvez le processus : Windows `netstat -ano \| findstr :5173` puis `taskkill /PID <numéro> /F` ; macOS/Linux `lsof -i :5173` puis `kill <numéro>`. Ports utilisés : 4000, 4400, 4500, 5001, 5173, 9000, 9099. |
| Premier démarrage long, ou arrêt pendant le téléchargement des émulateurs | Vérifiez la connexion internet, attendez jusqu'à 3 minutes, sinon `Ctrl+C` puis `npm run demo`. |
| « Mot de passe incorrect » avec un compte de démo | Reprenez le mot de passe dans `docs/COMPTES-DEMO.local.md` : il change après chaque `npm run demo:reset`. Fichier supprimé : `npm run demo` en génère de nouveaux. |
| Liste des universités vide sur « Créer un compte » | Attendez « Démo UniFlow prête » dans le terminal, puis rechargez la page (F5). |
| « Une demande d'inscription existe déjà » ou « Un compte existe déjà » | L'adresse a déjà servi : prenez-en une autre, ou repartez de zéro avec `npm run demo:reset`. |
| Page blanche ou « Accès refusé » inattendu | Rechargez la page (F5). Sinon `Ctrl+C`, puis `npm run demo`. |
| Rien ne va plus | `Ctrl+C`, puis `npm run demo:reset`. |

---

## Présentation

UniFlow est un SaaS **multi-tenant** : chaque université (tenant) a ses
données isolées, et cinq rôles (`super_admin_plateforme`,
`admin_universite`, `teacher`, `student`, `parent`) ont chacun leurs
droits, vérifiés côté serveur par les règles de sécurité Firebase.

### Stack

React + TypeScript + Vite · Tailwind CSS + DaisyUI · Lucide React ·
React Router · Firebase Authentication · Firebase Realtime Database ·
Cloud Functions (Node.js 22/TypeScript). Pas de Next.js, pas de Supabase,
pas de base SQL.

### Fonctionnalités livrées

- **Authentification Firebase** (e-mail/mot de passe), mot de passe
  oublié, gestion de session réelle.
- **Étudiants, enseignants, filières, cours, classes** : listes avec
  recherche et filtres, fiches, création et modification par l'admin de
  l'université, lecture adaptée pour l'enseignant, « Mon dossier » pour
  l'étudiant.
- **Accès de connexion créés par l'admin** depuis une fiche (Cloud
  Function `createUserAccount`), avec invitation par e-mail et renvoi.
- **Auto-inscription** (`/inscription`) : la demande ne donne aucun droit
  tant que l'admin de l'université ne l'a pas validée ; refus avec motif.
- **Tableau de bord propre à chaque rôle** (admin, enseignant, étudiant,
  parent) et espace plateforme pour le `super_admin_plateforme`.
- **Custom claims comme source de vérité RBAC/multi-tenant** (`role`,
  `universityId`), posés uniquement par la Cloud Function
  `onUserProfileWritten` — jamais un champ modifiable côté client.
- **RBAC complet** : matrice de permissions
  (`src/core/rbac/permissions.ts`) doublée par des règles équivalentes
  dans `database.rules.json`.
- **Isolation multi-tenant** : toute donnée pédagogique vit sous
  `universities/{universityId}/...` ; le `super_admin_plateforme` ne voit
  que les métadonnées commerciales, jamais les données pédagogiques.
- **Révocation immédiate** : suspendre un profil ou changer son rôle coupe
  ses accès sur-le-champ et déconnecte la personne.
- **Relations parent-enfant** (`parentLinks`) contrôlées par les règles.
- Interface responsive, thèmes clair et sombre, entièrement en français.
- **Tests** : règles de sécurité, Cloud Functions, parcours complets dans
  le navigateur, sur émulateurs (voir plus bas).

Les modules notes et examens, paiements, documents, e-learning et
notifications ne sont **pas encore livrés** : l'interface les annonce comme
« Bientôt disponible », sans lien ni donnée (voir « Feuille de route »).

### Détails de la démo locale

- Interface des émulateurs (comptes, base de données) :
  http://127.0.0.1:4000.
- **Contenu** : deux universités fictives (Université Horizon, Institut
  supérieur Baobab), chacune avec son administrateur, des enseignants, des
  étudiants, des filières, des cours et des classes, plus un parent lié à
  un enfant. Le déclencheur `onUserProfileWritten` est actif : la
  suspension d'un profil dans l'interface des émulateurs déconnecte
  immédiatement l'utilisateur concerné.
- **Ce que fait `npm run demo`** : compile les fonctions, démarre les
  émulateurs Auth, Database et Functions sur le projet fictif
  `demo-uniflow` (`--import` et `--export-on-exit` sur `.demo-data/`, non
  versionné), charge `database.rules.json`, importe le jeu de démo s'il
  n'existe pas encore (`functions/scripts/seedDemo.ts`), puis lance le
  front en mode émulateurs.
- Supprimer seulement `docs/COMPTES-DEMO.local.md` régénère les mots de
  passe en conservant les données.
- **Sans internet** : la démo fonctionne hors ligne après un premier
  lancement en ligne. Seules les polices Google manquent (polices système à
  la place). Détails : [docs/DEMO-HORS-LIGNE.md](docs/DEMO-HORS-LIGNE.md).
- Les suites de tests utilisent leurs propres émulateurs : arrêtez la démo
  avant de les lancer.

## Développement

### Démarrage contre un vrai projet Firebase

```bash
npm run setup
cp .env.example .env.local   # renseigner vos clés Firebase (voir FIREBASE_SECURITY.md) — fichier non versionné
npm run dev
```

L'identifiant du projet Firebase réel n'est pas versionné : `.firebaserc`
ne désigne que le projet fictif `demo-uniflow`. Voir
[docs/RECETTE.md](docs/RECETTE.md) pour le configurer sur votre poste.


### Cloud Functions

Runtime **Node.js 22** (`engines.node` de `functions/package.json`, utilisé
par `firebase deploy` ; nodejs20 est retiré depuis le 30 octobre 2026).
Utilisez Node 22 en local également.

```bash
cd functions
npm install
cp .env.example .env.<projectId>   # puis renseigner WEB_API_KEY et APP_LOGIN_URL (non versionné)
npm run build
npm test               # tests des callables et du déclencheur de claims (sans émulateur)
```

### Tests des Security Rules

```bash
cd rules && npm install && cd ..
npm run test:rules     # émulateur Database (projet demo-, aucune donnée réelle)
```

L'émulateur exige **Java 17+**. Sans Java dans le PATH :
`winget install EclipseAdoptium.Temurin.21.JDK`, ou réutilisez le JDK
d'Android Studio (`JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`).

### Tests d'audit Phase 1

```bash
cd tests/audit && npm install && cd ../..
npm run test:audit     # règles (A/B, rôles, matrice RBAC), claims serveur, callables, UI
```

Émulateurs uniquement (projets `demo-*`), Java 17+ et Node ≥ 22.18 requis ;
les tests d'interface pilotent Edge (`AUDIT_BROWSER_CHANNEL=chrome` pour
Chrome). Résultats détaillés dans `tests/audit/out/` (non versionné).

### Tester en local (émulateurs Firebase)

Toute l'application tourne en local sur les émulateurs Auth, Realtime
Database et Functions, sur le projet fictif `demo-uniflow` : aucun projet
réel, aucune facturation, aucun email réel.

Prérequis : Node 22 et Java 17+ (`npm run doctor` les vérifie ; Java est
détecté automatiquement, y compris le JDK d'Android Studio). La CLI
Firebase est une dépendance du projet, installée par `npm run setup`. Pour
une démo en une commande, préférez `npm run demo` (section « Lancer
UniFlow (jury) ») ; les étapes ci-dessous séparent émulateurs, seed et
front pour le développement.

```bash
npm run setup
# Terminal 1 — émulateurs (compile les functions puis démarre)
npm run emulators
# Terminal 2 — données de démo (réinitialise les émulateurs à chaque fois)
npm run emulators:seed
# Terminal 3 — application, avec VITE_USE_EMULATORS=true dans .env.local
npm run dev
```

- Application : http://localhost:5173 — connectez-vous avec l'admin affiché
  par le seed (`admin@universite-demo.test`, mot de passe régénéré à chaque
  seed, valable dans l'émulateur uniquement).
- Interface des émulateurs : http://127.0.0.1:4000 (onglets Authentication
  et Realtime Database pour voir comptes et données).
- **Lien d'invitation** (création ou renvoi d'accès) : aucun email n'est
  envoyé ; l'émulateur Auth l'écrit dans le terminal 1 (« To reset the
  password for …, follow this link: … ») et l'expose aussi sur
  `http://127.0.0.1:9099/emulator/v1/projects/demo-uniflow/oobCodes`.
- Tests sur émulateurs : `npm run test:rules`, `npm run test:integration`,
  `npm run test:audit`, `npm run test:revocation` (mesure de la révocation
  d'un rôle), `npm run test:session` (déconnexion ou bascule de rôle d'un
  utilisateur connecté), `npm run test:signup` (auto-inscription : demande,
  écran d'attente, validation et refus par l'admin), `npm run test:e2e` (parcours complet dans Edge :
  l'admin crée un enseignant et un étudiant, chacun se connecte). Sur la page
  d'action de l'émulateur, le nouveau mot de passe se passe dans l'URL
  (`&newPassword=…`) : il n'y a pas de formulaire en local.

**Namespace RTDB.** L'émulateur Functions lit le namespace `demo-uniflow`,
alors que l'émulateur Database charge `database.rules.json` sur
`demo-uniflow-default-rtdb`. Le seed charge donc les règles sur
`demo-uniflow`, namespace utilisé aussi par le front en mode émulateurs :
**lancez toujours le seed** avant d'utiliser l'application, sinon ce
namespace n'a pas les règles du projet. Production non concernée.

**Déclencheur `onUserProfileWritten` actif en local.** L'émulateur
Database n'exécute un déclencheur v2 que s'il est déclaré en `us-central1`.
La région du déclencheur vaut donc `us-central1` **sous l'émulateur
uniquement** (variable `FUNCTIONS_EMULATOR`, posée par l'émulateur), et
reste `europe-west1` en production : voir
`functions/src/auth/triggerRegion.ts` et son test. En local, créer,
modifier, suspendre ou supprimer un profil `/users/{uid}` met donc à jour
ses claims (et révoque ses sessions en cas de suspension), comme en
production ; `npm run test:audit:server` le vérifie. Limite de l'émulateur
Auth : il ne refuse pas un refresh token révoqué (la production, si) ; un
ID token révoqué, lui, est bien refusé.

### Configuration requise avant déploiement

- **Paramètres des fonctions** (dans `functions/.env.<projectId>`, créé à
  partir de `functions/.env.example` ou par l'invite de `firebase deploy` ;
  fichier exclu du dépôt) :
  `WEB_API_KEY` (la clé API web publique, même valeur que
  `VITE_FIREBASE_API_KEY`) et `APP_LOGIN_URL` (ex.
  `https://votre-domaine/login`, domaine présent dans Authentication >
  Paramètres > Domaines autorisés).
- **App Check** : les fonctions de gestion des accès l'exigent
  (`enforceAppCheck`). Enregistrez l'application web avec reCAPTCHA
  Enterprise (console > App Check) et renseignez
  `VITE_FIREBASE_APPCHECK_SITE_KEY`. En local : `VITE_FIREBASE_APPCHECK_DEBUG=true`
  puis enregistrez le jeton de débogage affiché dans la console du navigateur.

### Déploiement

```bash
npx firebase deploy --only functions,database --project <ID_DU_PROJET>
```

Procédure complète, avec un projet de recette séparé et sans identifiant
réel dans le dépôt : [docs/RECETTE.md](docs/RECETTE.md). `database` publie `database.rules.json` : les règles présentes dans la
console Firebase sont **remplacées** par ce fichier. Copiez-les d'abord
dans `database.rules.backup-console.json` et comparez.

## Comptes utilisateurs

L'écriture de `/users/{uid}` est interdite côté client (voir
`database.rules.json`) : seule une Cloud Function ou l'Admin SDK peut créer
ce noeud.

### Enseignants et étudiants : depuis l'interface

Un `admin_universite` crée les accès de connexion directement dans
l'application :

- à la création d'une fiche, en cochant **« Créer un accès de connexion »** ;
- ou plus tard, depuis la fiche (carte **« Accès de connexion »**).

La Cloud Function callable `createUserAccount` (région `europe-west1`) :

- vérifie que l'appelant est un `admin_universite` **actif** (relecture de
  `/users/{uid}`) d'une université ni suspendue ni archivée ;
- utilise l'**email de la fiche** (jamais une saisie du client) et
  l'université **des claims de l'appelant** ;
- applique une limite de 30 créations/heure par administrateur et le quota
  du plan (`meta.maxStudents` / `meta.maxTeachers`, sinon : standard
  500/50, premium 5000/500, enterprise illimité) ;
- crée le compte Auth, écrit `/users/{uid}` (avec `linkedRecordId`), lie la
  fiche, puis pose les custom claims **en dernier**. En cas d'échec, tout
  est annulé ; un compte impossible à supprimer est au minimum désactivé et
  privé de claims.

#### Invitation par email

Aucun mot de passe ni lien n'est jamais affiché à l'administrateur.
Firebase envoie directement à la personne l'email « réinitialisation du
mot de passe », qui lui permet de définir le sien puis la renvoie vers
`APP_LOGIN_URL`.

- **Modèle à personnaliser en français** : console Firebase >
  Authentication > Modèles > Réinitialisation du mot de passe. Ce modèle
  sert **aussi** à « Mot de passe oublié » : utilisez le texte neutre
  ci-dessous.
- **Validité du lien : environ 1 heure**, usage unique.
- **Renvoi** : sur la fiche, carte « Accès de connexion » > **« Renvoyer
  l'invitation »** (fonction `resendAccountInvite` : 3 renvois/heure par
  fiche, 30/heure par administrateur). Le renvoi est refusé si l'email de la
  fiche ne correspond plus à celui du compte.

Prérequis : le fournisseur **Email/Mot de passe** doit être activé dans
Firebase Authentication.

#### Modèle d'email (à coller dans la console)

Console Firebase > Authentication > Modèles > **Réinitialisation du mot de
passe** > icône crayon. Passez la **langue du modèle** sur « Français ».
Les variables `%…%` sont remplacées par Firebase ; ne modifiez pas
`%LINK%`.

- **Nom de l'expéditeur** : `%APP_NAME%` (ou le nom de votre établissement)
- **Objet** :

  ```text
  Définissez votre mot de passe – %APP_NAME%
  ```

- **Message** :

  ```text
  Bonjour,

  Un accès à %APP_NAME% est associé à l'adresse %EMAIL%.

  Pour définir votre mot de passe — qu'il s'agisse de votre première
  connexion ou d'un mot de passe oublié — cliquez sur le lien ci-dessous :

  %LINK%

  Ce lien est personnel, valable environ une heure et utilisable une seule
  fois. S'il a expiré, utilisez « Mot de passe oublié » sur la page de
  connexion ou demandez un nouvel envoi à l'administration de votre
  établissement.

  Si vous n'attendiez pas ce message, vous pouvez l'ignorer : aucun
  changement ne sera apporté à votre compte.

  Cordialement,
  L'équipe %APP_NAME%
  ```

Pour un objet ou un texte différent selon le cas (invitation ou mot de
passe oublié), voir « Service d'emailing dédié » dans le backlog sécurité.

#### Espace étudiant

Un étudiant ne peut lire **que sa propre fiche** (règles RTDB) : il y
accède par « Mon dossier » (`/app/mon-dossier`), via
`/users/{uid}.linkedRecordId`. Les comptes créés avant ce mécanisme n'ont
pas ce champ et affichent « Aucune fiche liée ».

### Premier administrateur d'université : manuellement

`createUserAccount` exige un appelant `admin_universite` et ne crée jamais
de rôle administrateur. Le tout premier compte (et tout
`super_admin_plateforme`) se crée donc via l'Admin SDK ou la console :

1. Créez un utilisateur dans Firebase Authentication (email/mot de passe).
2. Créez le noeud `/users/{uid}` avec les champs `uid, universityId, role,
   name, email, status, createdAt`, avec **`status: "active"`** (sinon
   aucun claim n'est posé). L'écriture déclenche `onUserProfileWritten`,
   qui pose les custom claims correspondants.
3. Pour `super_admin_plateforme`, laissez `universityId` à `null`.
4. Créez également `/universities/{universityId}/meta` avec `name, slug,
   plan, status, ownerUid, createdAt`.
5. Connectez-vous via `/login`. La redirection post-connexion se fait
   automatiquement selon le rôle.

> Le token Firebase doit être rafraîchi pour que les nouveaux custom claims
> soient pris en compte côté client — géré automatiquement par
> `onIdTokenChanged` dans `AuthContext`. Si les claims ne sont pas encore
> posés, la page de connexion affiche « compte en cours d'activation » avec
> un bouton « Réessayer ».

## Structure du projet

```
src/
  core/
    firebase/     # config, contexte d'auth, chemins RTDB scopés tenant
    rbac/          # matrice de permissions, useCan, getHomeRoute
    types/         # types de domaine
  modules/         # un dossier par module métier
    students/ teachers/ programs/ courses/ classes/   # livrés
    accounts/      # accès de connexion (création, renvoi d'invitation)
    signup/        # demandes d'inscription et leur validation
    dashboard/     # tableau de bord par rôle
    grades/ payments/ elearning/ …                    # réservés, vides
  shared/
    components/    # Sidebar, Navbar, AppShell, ProtectedRoute, états UI
    hooks/         # useTheme, useDocumentTitle, useCreateFromUrl
    config/        # libellés de rôles
    utils/         # pluriels, couleurs de statut
  pages/
    public/        # LoginPage, ForgotPasswordPage, SignupPage
    app/           # DashboardPage, PlatformHomePage
functions/
  src/
    auth/          # custom claims, createUserAccount, resendAccountInvite
    signup/        # liste des universités, dépôt et validation des demandes
  scripts/         # jeux de données des émulateurs (démo, tests)
scripts/           # demo, doctor, détection de Java
tests/audit/       # tests de bout en bout sur émulateurs (règles, serveur, navigateur)
rules/             # tests unitaires des Security Rules
database.rules.json  # Security Rules RTDB (voir FIREBASE_SECURITY.md)
```

## Backlog sécurité

Points identifiés lors des revues, non traités à ce stade :

1. **Lecture des étudiants par les enseignants (RGPD).** Un enseignant lit
   toutes les fiches étudiants de l'université (emails, matricules, `uid`).
   À restreindre aux étudiants de ses cours ou classes (index
   `teacherStudents/{teacherUid}/{studentId}` maintenu par Cloud Function,
   règle de lecture par fiche) et/ou à une vue réduite sans email.
2. **Unification de `studentId` (= id de fiche).** `enrollments` utilise
   l'id de fiche, tandis que `grades`, `payments` et `parentLinks`
   comparent `studentId` à l'uid Auth. Avant de livrer ces modules :
   `studentId` = id de fiche partout, et règles fondées sur
   `students/{studentId}/uid === auth.uid` (comme `enrollments`).
3. **Recomptage des quotas.** `universities/{id}/usage/{role}Accounts` part
   de 0 : les comptes créés avant ce mécanisme ne sont pas comptés, et une
   suppression de compte ne décrémente rien. Prévoir un script ou une
   fonction planifiée de recomptage (fiches avec `uid`, par rôle).
4. **Service d'emailing dédié.** Le modèle Firebase est commun à
   l'invitation et à « Mot de passe oublié », avec un lien valable ~1 h. Un
   service dédié (Resend, SendGrid… clé dans Secret Manager) permettrait un
   email d'invitation distinct, aux couleurs de l'établissement, et une
   durée de validité plus longue (jeton d'invitation maison).

## Feuille de route

| État | Étape |
|---|---|
| Livré | Fondations (authentification, custom claims, RBAC, multi-tenant, shell) |
| Livré | Étudiants · Enseignants, filières, cours, classes · Accès de connexion |
| Livré | Audit de sécurité, démo locale en une commande (`v1.0-soutenance`) |
| Livré | Auto-inscription validée par l'admin (`v1.1-soutenance`) |
| Livré | Tableau de bord par rôle, espace plateforme (`v1.2-soutenance`) |
| À venir | Notes/Examens → Inscriptions pédagogiques/Paiements → Documents/Bibliothèque → E-learning → Notifications → IA & Insights → Espace commercial plateforme → Durcissement sécurité & audit RGPD |

Voir `PROMPTS.md` pour l'historique des décisions structurantes et
`FIREBASE_SECURITY.md` pour le détail du modèle de sécurité.
