# Modèle de sécurité Firebase

## 1. Principe directeur

Le client ne fait jamais confiance à lui-même. Trois lignes de défense
indépendantes protègent chaque donnée :

1. **Custom claims** (`role`, `universityId`) — posés uniquement par une
   Cloud Function via l'Admin SDK, jamais modifiables par le client.
2. **RBAC applicatif** (`src/core/rbac/permissions.ts`) — conditionne
   l'affichage et les actions dans l'UI. C'est une garde d'expérience
   utilisateur, **pas** une garantie de sécurité.
3. **Security Rules** (`database.rules.json`) — la seule garantie réelle,
   appliquée côté serveur Firebase à chaque lecture/écriture, quel que
   soit le chemin par lequel la requête arrive (app officielle, appel SDK
   direct, script tiers).

Une règle absente ou trop permissive dans `database.rules.json`
**n'est jamais compensée** par le fait que l'UI n'expose pas le bouton
correspondant.

## 2. Custom claims : source de vérité RBAC et multi-tenant

- `role` et `universityId` sont posés sur le token Firebase Auth par la
  Cloud Function `onUserProfileWritten` (`functions/src/auth/setCustomClaims.ts`),
  déclenchée à chaque écriture de `/users/{uid}`.
- `/users/{uid}` est **interdit en écriture directe côté client**
  (`".write": false` dans `database.rules.json`) : seule une Cloud
  Function ou l'Admin SDK peut créer/modifier ce noeud. C'est ce qui
  empêche un utilisateur de s'auto-attribuer un rôle ou de changer de
  tenant.
- Si le champ `status` passe à `suspended`, ou si le noeud est supprimé,
  la fonction retire immédiatement les claims (`setCustomUserClaims(uid, {})`),
  coupant l'accès sans attendre une expiration naturelle du token.
- Côté client, `AuthContext` écoute `onIdTokenChanged` et lit
  `getIdTokenResult().claims` — jamais un champ RTDB — pour peupler
  `role`/`universityId`. Si un compte vient d'être créé et que les claims
  ne sont pas encore posés, l'UI affiche un état "compte en cours
  d'activation" plutôt qu'une erreur silencieuse.

## 3. Isolation multi-tenant

- Toute donnée pédagogique vit sous `universities/{universityId}/...`.
- Chaque règle sous ce chemin vérifie
  `auth.token.universityId === $universityId` — jamais une comparaison
  sur un champ de la donnée elle-même (falsifiable avant écriture).
- Côté client, `tenantCollectionPath(universityId, sub)`
  (`src/core/firebase/paths.ts`) est le **seul** point de construction de
  chemin vers une sous-collection d'un tenant ; il lève une erreur si
  `universityId` est vide, empêchant par construction toute requête mal
  scopée.

## 4. Cloisonnement du `super_admin_plateforme`

Ce rôle ne doit **jamais** accéder aux données nominatives ou pédagogiques
d'un tenant, même en lecture seule. Trois garanties indépendantes :

1. **Forme de l'arbre** : `platform/universitiesIndex` ne contient
   structurellement que des métadonnées commerciales (nom, plan, statut,
   facturation agrégée) — aucune clé ne pointe vers un sous-arbre
   pédagogique. Ce n'est pas qu'une règle, c'est l'absence physique du
   chemin.
2. **Security Rule explicite** : `platform/universitiesIndex` n'est
   lisible que par `auth.token.role === 'super_admin_plateforme'`, et ce
   rôle n'apparaît dans **aucune** condition `.read` sous
   `universities/{universityId}/...` (vérifiable par recherche textuelle
   dans `database.rules.json` : `super_admin_plateforme` n'apparaît qu'une
   seule fois, sous `platform`).
3. **Absence d'endpoint serveur** : aucune Cloud Function actuelle ou
   prévue n'expose de lecture des sous-arbres pédagogiques à ce rôle. Tout
   futur besoin de support technique devra passer par une procédure
   distincte avec consentement explicite de l'université, hors périmètre
   du SaaS lui-même — à documenter séparément le cas échéant.

## 5. Relations parent-enfant (`parentLinks`)

- Chemin : `universities/{universityId}/parentLinks/{parentUid}/{studentId}`.
- Un parent peut avoir plusieurs entrées (un enfant par entrée), chacune
  avec `relation`, `authorized`, `grantedAt`, `grantedBy`.
- **Écriture** réservée à `admin_universite` (ou Cloud Function) — jamais
  au parent lui-même, pour empêcher un auto-rattachement.
- **Lecture** des données d'un étudiant par un `parent` (`grades`,
  `payments`, `documents`) est conditionnée, dans `database.rules.json`, à
  l'existence de l'entrée correspondante avec `authorized === true` :

  ```json
  "auth.token.role === 'parent' && root.child('universities').child($universityId).child('parentLinks').child(auth.uid).child(<studentId de la donnée>).child('authorized').val() === true"
  ```

  Le `<studentId de la donnée>` est lu depuis la donnée elle-même
  (`data.child('studentId').val()`), jamais depuis un paramètre fourni par
  le client, pour empêcher un parent de usurper un `studentId` arbitraire
  dans sa requête.
- **Révocation** : une entrée `parentLinks` doit être explicitement mise à
  `authorized: false` (ou supprimée) par un `admin_universite` en cas de
  changement de situation (ex. retrait de garde) — ce n'est pas automatique
  à la suppression du compte étudiant. Aucune interface de gestion des
  liens parent-enfant n'est encore livrée ; la règle de sécurité, elle, est
  effective.

## 6. RBAC : correspondance `permissions.ts` ↔ `database.rules.json`

| Ressource | `permissions.ts` | `database.rules.json` |
|---|---|---|
| `platformUniversities` | `super_admin_plateforme` : CRUD ; tous les autres : rien | `platform/universitiesIndex` : lecture `super_admin_plateforme` uniquement, écriture serveur uniquement |
| `students`/`programs`/`courses`/`classes`/`library`/`academicYears` | `admin_universite` : CRUD ; `teacher`/`student` : lecture ; `parent` : rien | lecture refusée à `parent` (`role !== 'parent'`), écriture `admin_universite` uniquement |
| `teachers` | `admin_universite` : CRUD ; `teacher` : lecture | lecture `admin_universite`/`teacher`, écriture `admin_universite` |
| `grades` (v1.4) | `admin_universite` : CRUD ; `teacher` : CRU ; `student` : lecture ; `parent` : rien | admin : lecture et correction dans son université ; enseignant : lecture et écriture sur SES cours, pour un étudiant de la filière du cours, jamais de suppression ; étudiant : `students/{studentId}/uid === auth.uid` ; valeur obligatoire entre 0 et `exams/{examId}/maxScore`, identifiant `{examId}_{studentId}` |
| `exams` (v1.4) | `admin_universite` : CRUD ; `teacher` : CRU ; `student` : lecture ; `parent` : rien | enseignant : SES cours ; étudiant : cours de la filière de sa fiche (`users/{uid}/linkedRecordId`) ; type, date, coefficient, note maximale validés ; cours et note maximale immuables |
| `payments`/`documents` | accès restreint au propriétaire (`student`) et aux enfants autorisés (`parent`) | vérification par donnée (`data.child('studentId')`, `ownerUid`) + `parentLinks` ; `studentId` encore à unifier sur l'id de fiche (README, backlog) |
| `enrollments` | `admin_universite` : CRUD ; `teacher`/`student` : lecture | étudiant : `students/{studentId}/uid === auth.uid` ; `parent` exclu |
| `elearning` | `admin_universite`/`teacher` : CRU ; `student` : lecture | idem |
| `notifications` | lecture propriétaire uniquement | `data.child('recipientUid').val() === auth.uid` |
| `aiInsights` | `admin_universite`/`teacher` : lecture seule ; personne en écriture côté client | écriture `false` (Cloud Functions uniquement), lecture `admin_universite`/`teacher` |

**Procédure de revue** : toute modification de `permissions.ts` doit être
accompagnée, dans la même review, d'une vérification ligne à ligne de
`database.rules.json` pour la ressource concernée. Aucune des deux
matrices ne doit évoluer seule.

## 7. `.indexOn` déclarés

RTDB ralentit fortement (et journalise un avertissement) toute requête
`orderByChild`/`orderByValue` sans index déclaré. Index déclarés, chacun
avec les requêtes réelles du module livré :

| Chemin | `.indexOn` |
|---|---|
| `students`, `teachers` | `lastName`, `searchKey` (tri et recherche des listes) |
| `programs`, `courses`, `classes` | `name` |
| `signupRequests` | `status`, `createdAt` (demandes à traiter) |
| `platform/universitiesIndex` | `plan`, `status` |
| `grades` | `examId` (notes d'un examen : admin, enseignant du cours), `studentId` (notes de sa fiche : étudiant) |
| `exams` | `courseId` (examens d'un cours : enseignant du cours, étudiant de la filière) |

Les listes de `grades` et d'`exams` ne s'ouvrent que **par requête**
(`orderByChild` + `equalTo`), vérifiée par les règles (`query.orderByChild`,
`query.equalTo`) ; seul l'admin lit la liste complète des examens. Les
modules non livrés déclareront leurs index avec leurs requêtes réelles :
les déclarer sans usage serait de la spéculation non vérifiable.

## 8. Configuration publique vs secrets serveur

- **Configuration publique** (`VITE_FIREBASE_*` dans `.env.local` à la
  racine, copié depuis `.env.example`, jamais versionné) :
  `apiKey`, `authDomain`, `databaseURL`, etc. Ces valeurs sont conçues par
  Firebase pour être visibles côté client (elles apparaissent forcément
  dans le bundle JS livré au navigateur) — leur confidentialité n'est
  **pas** le mécanisme de protection. C'est pourquoi `.env.example` (racine
  du projet) ne contient que ces champs.
- **Secrets réels** (compte de service Admin SDK, futures clés de
  fournisseurs IA, futures clés Stripe) : ne transitent **jamais** par le
  bundle client ni par un fichier `.env*` versionné. Ils vivent
  exclusivement dans la configuration d'environnement des Cloud Functions
  (`functions/.env.<projectId>`, non versionné, ou de préférence
  `firebase functions:secrets:set` / Secret Manager). `functions/.env.example`
  documente les noms attendus sans jamais contenir de valeur réelle.
- **Fichiers `.env` et Git** : `.gitignore` (racine et `functions/`)
  ignore `.env` et `.env.*`. Seuls sont versionnés `.env.example`,
  `functions/.env.example` et `functions/.env.demo-uniflow` (valeurs
  fictives pour les émulateurs).
- Vérification effectuée avant livraison : recherche de toute clé
  ressemblant à un secret (`AIza...` en dur, `sk_`, `service_account`)
  dans `src/` — aucune occurrence, toutes les valeurs passent par
  `import.meta.env`.

## 9. Limites connues et suivi pour les phases suivantes

- Les règles `.read`/`.write` par enfant (`$gradeId`, `$paymentId`, etc.)
  n'autorisent pas nativement un listing filtré performant à grande
  échelle sans `.indexOn` dédié — à affiner phase par phase avec les
  requêtes réelles de chaque module (voir §7).
- La révocation d'un `parentLink` est une opération manuelle
  (`admin_universite`) tant qu'aucune interface ne gère les liens
  parent-enfant — pas d'automatisme à la suppression d'un compte
  étudiant pour l'instant.
- Le calcul des insights IA (Phase 9) devra explicitement écrire
  `indicativeOnly: true` sur chaque noeud généré, et aucune Cloud Function
  future ne doit déclencher d'action automatique (notification, changement
  de statut) directement à partir d'un `riskScore` sans validation humaine
  explicite.
