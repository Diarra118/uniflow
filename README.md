# SaaS de Gestion Universitaire Piloté par IA — Phase 1 (Fondations)

Ce dépôt contient les **fondations réelles et fonctionnelles** de la
plateforme : authentification Firebase, custom claims, contexte
multi-tenant, RBAC, shell d'application responsive (clair/sombre), pages
publiques, et routing protégé avec redirection selon le rôle.

**Aucun module métier n'est implémenté à ce stade** (étudiants, enseignants,
notes, paiements, e-learning, etc.) — conformément au plan de développement
par phases validé dans l'architecture v1.1.

## Stack

React + TypeScript + Vite · Tailwind CSS + DaisyUI · Lucide React ·
React Router · Firebase Authentication · Firebase Realtime Database ·
Firebase Storage · Cloud Functions (Node.js/TypeScript). Pas de Next.js,
pas de Supabase, pas de base SQL.

## Ce qui est fonctionnel dès maintenant

- **Authentification Firebase** (email/mot de passe), réinitialisation de
  mot de passe, gestion de session réelle.
- **Custom claims comme source de vérité RBAC/multi-tenant** (`role`,
  `universityId`) — jamais un champ de donnée lisible/modifiable côté
  client. Attribués par la Cloud Function `onUserProfileWritten`.
- **RBAC complet** : matrice de permissions (`src/core/rbac/permissions.ts`)
  pour les 5 rôles, doublée par des règles équivalentes dans
  `database.rules.json`.
- **Isolation multi-tenant** : toute donnée pédagogique vit sous
  `universities/{universityId}/...` ; un helper unique
  (`tenantCollectionPath`) empêche par construction d'omettre le
  `universityId`.
- **Cloisonnement strict du `super_admin_plateforme`** : accès uniquement à
  `platform/universitiesIndex` (métadonnées commerciales), jamais aux
  données pédagogiques d'un tenant — vérifié à la fois par la forme de
  l'arbre et par les Security Rules.
- **Relations parent-enfant** (`parentLinks`) : un parent peut être
  rattaché à plusieurs enfants ; chaque lecture de donnée d'un enfant par
  un parent est conditionnée à une entrée `parentLinks` autorisée.
- **Shell d'application** responsive : sidebar (aperçu des modules à venir,
  sans données ni routes fonctionnelles), navbar, drawer mobile, thèmes
  clair/sombre persistés.
- **Redirection selon le rôle** : `super_admin_plateforme` → `/app/plateforme`,
  autres rôles → `/app`.
- Interface entièrement en français.

## Démarrage local

```bash
npm install
cp .env.example .env.local   # renseigner vos clés Firebase (voir FIREBASE_SECURITY.md) — fichier non versionné
npm run dev
```

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
firebase deploy --only functions,database
```

`database` publie `database.rules.json` : les règles présentes dans la
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
    types/         # types de domaine (Phase 1 uniquement)
  modules/         # un dossier vide par module métier — implémentation
                    # phase par phase, aucun code présent à ce stade
  shared/
    components/    # Sidebar, Navbar, AppShell, ProtectedRoute, états UI
    hooks/         # useTheme
    config/        # libellés de rôles
  pages/
    public/        # LoginPage, ForgotPasswordPage
    app/           # DashboardPage, PlatformHomePage
functions/
  src/
    auth/          # custom claims, createUserAccount, resendAccountInvite
    triggers/       # vide — déclencheurs métier des phases suivantes
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

## Plan de développement (rappel)

Phase 1 (ce livrable) → Étudiants → Enseignants/Filières/Cours/Classes →
Notes/Examens → Inscriptions/Paiements → Documents/Bibliothèque →
E-learning → Notifications → IA & Insights → Espace commercial plateforme
→ Durcissement sécurité & audit RGPD.

Voir `PROMPTS.md` pour l'historique des décisions structurantes et
`FIREBASE_SECURITY.md` pour le détail du modèle de sécurité.
