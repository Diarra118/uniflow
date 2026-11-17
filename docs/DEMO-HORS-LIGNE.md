# Démo locale sans connexion internet

Vérification faite le 17/11/2026 sur Windows 10, firebase-tools 15.30.2,
avec `npm run demo` (données conservées dans `.demo-data`).

## Méthode

Le poste n'a pas été physiquement déconnecté (pas de droits
administrateur pour couper la carte réseau). L'absence d'internet a été
simulée et observée à trois niveaux :

| Niveau | Méthode | Résultat |
|---|---|---|
| Processus Node (CLI Firebase, émulateur Auth, runtime des fonctions, seed, Vite) | `NODE_OPTIONS=--require` d'un module qui refuse toute connexion et toute résolution DNS vers un hôte non local, et les consigne | Démo complète fonctionnelle |
| Navigateur (Edge) | toute requête hors `localhost` / `127.0.0.1` interrompue (`internetdisconnected`) | 9 comptes connectés, écrans et droits corrects, interface des émulateurs utilisable |
| Émulateur Database (Java) | `netstat` : connexions établies vers l'extérieur | aucune |

## Ce qui fonctionne hors ligne

Démarrage des émulateurs, chargement des règles, import et export des
données, déclencheur `onUserProfileWritten`, callables
(`createUserAccount`, `resendAccountInvite`), connexion de tous les rôles,
isolation des universités, révocation immédiate, interface des
émulateurs (http://127.0.0.1:4000).

**App Check** : désactivé en mode émulateurs (`src/core/firebase/config.ts`)
et non exigé par l'émulateur Functions. Aucune dépendance à reCAPTCHA.

**E-mails** : aucun envoi. Les liens d'invitation sont écrits par
l'émulateur Auth dans le terminal et sur
`http://127.0.0.1:9099/emulator/v1/projects/demo-uniflow/oobCodes`.

## Ce qui dépend encore d'internet

| Élément | Effet hors ligne | Gravité |
|---|---|---|
| **Polices Google** (`index.html` : Spectral, Inter, JetBrains Mono sur `fonts.googleapis.com`) | Échec silencieux ; polices de secours du système (Georgia, system-ui, monospace). L'application reste lisible, l'apparence diffère un peu. | Faible (esthétique) |
| **Premier lancement** : jar de l'émulateur Database et archive de l'interface des émulateurs, téléchargés dans `~/.cache/firebase/emulators` | Sans ce cache, les émulateurs ne démarrent pas. L'archive de l'interface (`ui-v1.15.0.zip`) n'a été téléchargée qu'au premier `npm run demo`. | **Bloquant si le cache est absent** : lancer la démo une fois en ligne sur le poste de démonstration |
| **Installation** : `npm install`, `npm --prefix functions install`, Java 17+, firebase-tools | Prérequis à installer en ligne | Bloquant si absent |
| CLI Firebase : détection des métadonnées Google Cloud (`169.254.169.254`, `metadata.google.internal`), `firebase.googleapis.com`, vérification de version de `firebase-functions` (`npm show` sur registry.npmjs.org) | Tentatives en échec, sans effet sur la démo | Aucune |

## Recommandations

1. Sur le poste de démonstration, lancer `npm run demo` **une fois avec
   internet** (installation et cache des émulateurs), puis l'arrêter par
   Ctrl+C.
2. Pour une apparence identique hors ligne : héberger les polices dans le
   projet (paquets `@fontsource/*` ou fichiers `woff2` dans `public/`) au
   lieu de Google Fonts. Non fait ici : décision à prendre.
