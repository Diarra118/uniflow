# Historique des prompts et décisions structurantes

Ce fichier trace les décisions qui ont façonné l'architecture et
l'implémentation, pour que toute personne reprenant le projet comprenne le
*pourquoi* des choix techniques sans avoir à rejouer toute la conversation.

## 1. Cadrage initial

Demande d'un SaaS multi-tenant de gestion universitaire et d'e-learning,
avec isolation stricte par université (tenant), 5 rôles utilisateurs
(`super_admin_plateforme`, `admin_universite`, `teacher`, `student`,
`parent`), et 15 modules métier (étudiants, enseignants, filières, cours,
programmes, classes, notes, examens, inscriptions, réinscriptions,
paiements, documents, bibliothèque, e-learning, notifications, années
académiques). Contrainte : rôles contrôlés côté application **et** côté
Firebase.

## 2. Renommage et changement de socle de données

Le projet est renommé **« SaaS de Gestion Universitaire Piloté par IA »**.
Décision de remplacer **Firestore par Firebase Realtime Database**
(contraintes explicites : pas de Next.js, pas de Supabase, pas de base
SQL). Un module transverse **IA & Insights** est ajouté (détection
d'étudiants à risque, résumés automatiques, assistant documentaire).

Conséquence architecturale majeure : RTDB n'a pas de requêtes composées ni
de sous-collections indépendantes — le modèle de données doit être pensé en
arbre dénormalisé, avec des index manuels (`indexes/...`) maintenus
explicitement là où Firestore aurait permis une requête directe.

## 3. Validation de l'architecture avec 7 ajustements (v1.1)

1. **`super_admin_plateforme` cloisonné** aux métadonnées commerciales des
   universités (création, plan, statut, facturation/statistiques) —
   jamais aux données nominatives ou pédagogiques d'un tenant, même en
   lecture seule.
2. **Relations parent-enfant multiples** : un parent peut être rattaché à
   plusieurs enfants ; le modèle de données et les Security Rules
   vérifient explicitement chaque relation (`parentLinks`) avant toute
   lecture.
3. **Gouvernance IA stricte** : les insights (`riskScore` inclus) sont
   strictement indicatifs — aucune décision académique, disciplinaire ou
   d'évaluation n'est automatisée. Porté par la donnée elle-même
   (`indicativeOnly: true`), pas seulement par convention d'affichage.
4. **Aucun module métier en Phase 1** — le plan de développement par
   phases est suivi strictement.
5. **Interface entièrement en français.**
6. **Stack confirmée** : React + TypeScript + Vite, Tailwind CSS, DaisyUI,
   Lucide React, React Router, Firebase Authentication, Firebase Realtime
   Database, Firebase Storage, Cloud Functions.
7. **Secrets exclusivement côté serveur** — distinction explicite entre la
   configuration publique du SDK client Firebase (non sensible par
   conception) et les véritables secrets (compte de service Admin SDK,
   futures clés IA/Stripe), qui ne transitent jamais par le bundle client.

## 4. Implémentation de la Phase 1

Périmètre strict validé : fondations du projet, design system et identité
visuelle, pages publiques, Firebase Authentication, gestion des sessions,
custom claims, contexte multi-tenant, RBAC, routes protégées, redirection
selon le rôle, shell/dashboard de base, responsive desktop/tablette/mobile,
mode clair/sombre. **Aucun CRUD métier.**

Décisions d'implémentation notables :
- Les **custom claims** (`role`, `universityId`) sont la seule source de
  vérité pour le RBAC et le multi-tenant côté client — jamais un champ lu
  depuis un noeud RTDB modifiable. Ils sont posés par la Cloud Function
  `onUserProfileWritten`, déclenchée à l'écriture de `/users/{uid}` (elle-même
  interdite en écriture directe côté client).
- `parentLinks` est imbriqué sous chaque tenant
  (`universities/{universityId}/parentLinks/{parentUid}/{studentId}`),
  cohérent avec le principe d'isolation par `universityId` — une première
  version l'avait par erreur placé à la racine, corrigée avant la
  finalisation de `database.rules.json`.
- La sidebar Phase 1 affiche un aperçu des modules à venir **sans aucune
  route ni donnée réelle** (design/roadmap uniquement), pour donner une
  vision produit sans anticiper l'implémentation métier.
- Redirection post-connexion différenciée : `super_admin_plateforme` →
  `/app/plateforme` (espace dédié, placeholder sans CRUD), tous les autres
  rôles → `/app` (tableau de bord générique).
- Un premier essai de build a révélé un `vite.config.ts` retombé sur le
  template par défaut (plugin Tailwind et alias `@` absents) : corrigé
  avant livraison, avec vérification que le CSS compilé contient bien les
  classes DaisyUI attendues.

## 5. Suite : versions livrées après la Phase 1

Les modules suivants ont été livrés sur le gabarit prévu (schéma Zod →
couche d'accès aux données scopée tenant → hook temps réel → page), adapté
à Realtime Database. Le détail est dans l'historique Git.

| Version (tag) | Contenu |
|---|---|
| Phases 2 et 3 (premier commit) | Étudiants, enseignants, filières, cours et classes ; création des accès de connexion par l'admin, avec invitation par e-mail |
| — | Audit de sécurité (lots 1 à 3) : dépendances, Node 22, droits enseignant, révocation immédiate des accès |
| `v1.0-soutenance` | Démo locale en une commande (`npm run demo`) avec jeu de données réaliste ; finitions de l'interface |
| `v1.1-soutenance` | Auto-inscription (`/inscription`) validée ou refusée par l'admin de l'université |
| `v1.2-soutenance` | Tableau de bord propre à chaque rôle, espace plateforme |

Restent à faire, dans l'ordre du plan : notes et examens, paiements,
documents et bibliothèque, e-learning, notifications, IA, espace
commercial de la plateforme (voir README, « Feuille de route »).
