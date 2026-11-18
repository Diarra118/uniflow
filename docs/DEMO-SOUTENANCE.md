# Aide-mémoire — démo de soutenance UniFlow

Tout se passe en local, sur les émulateurs Firebase (projet fictif
`demo-uniflow`) : aucun service réel, aucune donnée réelle.

## 1. Commandes

| Action | Commande |
|---|---|
| Lancer la démo | `npm run demo` |
| Arrêter (données sauvegardées dans `.demo-data/`) | **Ctrl+C** dans le terminal, attendre « données sauvegardées » |
| Remettre le jeu de démo à zéro (nouveaux mots de passe) | `npm run demo:reset` |
| Régénérer seulement les mots de passe (données conservées) | supprimer `docs/COMPTES-DEMO.local.md`, puis `npm run demo` |

- Application : http://localhost:5173
- Interface des émulateurs : http://127.0.0.1:4000
- Base de données de la démo dans cette interface :
  http://127.0.0.1:4000/database/demo-uniflow/data
- Comptes et mots de passe : `docs/COMPTES-DEMO.local.md` (**ne pas
  projeter ce fichier**).

Démarrage : 60 à 90 s au premier lancement (compilation), environ 40 s
ensuite. La démo est prête quand le terminal affiche « Démo UniFlow prête ».

## 2. La veille

1. **Avec internet** : `npm install && npm --prefix functions install`, puis
   `npm run demo` une fois. Ce premier lancement met en cache les émulateurs
   (`~/.cache/firebase/emulators`) ; ensuite la démo fonctionne hors ligne
   (seules les polices Google manquent, remplacées par celles du système).
2. **Repartir d'un jeu propre** : `npm run demo:reset` (efface les essais
   précédents et génère de nouveaux mots de passe).
3. **Vérifier les comptes** : ouvrir `docs/COMPTES-DEMO.local.md` et se
   connecter une fois avec l'admin Horizon, l'admin Baobab, un enseignant et
   un étudiant.
4. **Répéter le parcours** ci-dessous une fois en entier, puis
   `npm run demo:reset` pour effacer les comptes créés pendant la répétition
   (étudiant avec accès et auto-inscription).
5. Arrêter par **Ctrl+C**. Le jour J, lancer `npm run demo` **10 minutes
   avant** de passer.
6. Préparer : navigateur ouvert sur http://localhost:5173 (thème clair), une
   **fenêtre de navigation privée** pour les étudiants (Fatou, puis
   l'auto-inscription d'Aïssatou). Attention : toutes les fenêtres privées
   partagent la même session, une seule personne peut y être connectée à la
   fois ; un onglet sur
   l'interface des émulateurs, le fichier des comptes sur un écran non
   projeté. Désactiver la mise en veille et les notifications.

## 3. Parcours de démonstration (10 minutes)

| Temps | Étape | Ce qu'on fait | Ce qu'on montre |
|---|---|---|---|
| 0:00 | **Connexion admin** | Se connecter avec `admin@horizon.test` | Page de connexion UniFlow, redirection vers le tableau de bord, rôle affiché |
| 1:00 | **Listes** | Étudiants (filtre « En attente », recherche « Diallo »), Enseignants, Filières, Cours, Classes | Statuts colorés (vert, orange, gris), « Non attribué », enseignant « (inactif) », nombre d'éléments par université |
| 2:30 | **Créer un étudiant avec accès** | Étudiants > **Nouvel étudiant** : prénom, nom, matricule `HZ-2026-050`, e-mail `fatou.sy@horizon.test`, filière et classe, cocher **Créer un accès de connexion** > **Créer** | Fenêtre « Accès de connexion créé », invitation envoyée ; sur la fiche : « Accès créé » |
| 3:15 | **Définir son mot de passe** | Dans le terminal de la démo, copier le lien affiché après « To reset the password for fatou.sy@horizon.test, follow this link ». Il se termine par `newPassword=NEW_PASSWORD_HERE` : remplacer `NEW_PASSWORD_HERE` par `Soutenance2026`, puis l'ouvrir dans la fenêtre privée (retour automatique sur la page de connexion) | En production, la personne reçoit ce lien par e-mail ; l'émulateur l'écrit dans le terminal |
| 4:00 | **Connexion de l'étudiant** | Fenêtre privée : se connecter avec `fatou.sy@horizon.test` / `Soutenance2026` | Navigation réduite, « Mon dossier », liste des étudiants refusée (« Accès refusé »). Puis **Se déconnecter** |
| 5:00 | **Auto-inscription** | Même fenêtre privée : page de connexion > **Créer un compte** : prénom `Aïssatou`, nom `Ba`, e-mail `aissatou.ba@horizon.test`, mot de passe `Soutenance2026` (deux fois), université **Université Horizon**, rôle **Étudiant** > **Envoyer ma demande** | Seul le nom des universités est proposé ; écran « Votre demande est en attente de validation par votre université », aucune donnée accessible |
| 6:00 | **Validation par l'admin** | Fenêtre admin : lien **Inscriptions** (compteur « 1 ») > ligne Ba Aïssatou > **Valider** > matricule `HZ-2026-051` > **Valider** | Sans recharger, la fenêtre privée bascule seule dans l'espace étudiant (« Mon dossier » avec le matricule) ; fiche créée côté admin. Option : montrer un **Refuser** avec motif sur une seconde demande |
| 7:00 | **Suspension en direct** | Laisser Aïssatou sur « Mon dossier ». Interface des émulateurs > Realtime Database (`demo-uniflow`) > `users` > profil de `aissatou.ba@horizon.test` > `status` : remplacer `active` par `suspended` | La fenêtre privée se déconnecte immédiatement avec « Votre compte a été suspendu… » ; une nouvelle connexion n'ouvre aucun accès |
| 8:30 | **Isolation entre universités** | Fenêtre privée : se connecter avec `admin@baobab.test` | Uniquement les données de l'Institut Baobab ; aucune trace d'Horizon |
| 9:30 | **Mode sombre** | Icône lune en haut à droite, puis recharger la page et se déconnecter | Thème conservé après rechargement et sur la page de connexion |
| 10:00 | Conclusion | — | Règles de sécurité testées (isolation, rôles, révocation immédiate, demandes d'inscription sans aucun droit avant validation) |

Astuce pour la suspension : dans `users`, chaque profil est rangé sous son
identifiant (uid) ; le bon est celui dont le champ `email` vaut
`aissatou.ba@horizon.test`. L'uid figure aussi dans l'onglet Authentication de
l'interface des émulateurs (colonne User UID).

## 4. Problèmes possibles et solution rapide

| Problème | Solution |
|---|---|
| **Port occupé** (« Port 5173 is already in use », « port taken », démarrage qui échoue) | Une autre démo ou un test tourne encore. Le fermer (Ctrl+C dans son terminal). Sinon, trouver le processus : `netstat -ano \| findstr :5173` (ou `:9000`, `:9099`, `:4000`), puis `taskkill /PID <numéro> /F`, et relancer `npm run demo`. |
| **Émulateurs lents** (plus de 2 minutes sans « Démo UniFlow prête ») | Attendre 3 minutes au premier lancement. Au-delà : Ctrl+C, puis relancer `npm run demo`. Écran figé dans le navigateur : recharger la page (F5). |
| **Données absentes ou « Accès refusé » inattendu** | Recharger la page. Vérifier que le terminal affiche « Règles chargées ». Sinon Ctrl+C et relancer. |
| **Mot de passe d'un compte de démo oublié** | Ouvrir `docs/COMPTES-DEMO.local.md` (écran non projeté). Fichier perdu : Ctrl+C, relancer `npm run demo`, qui régénère les mots de passe et réécrit le fichier (données conservées). |
| **Mot de passe de l'étudiant créé en direct oublié**, ou lien refusé (« INVALID_OOB_CODE » : un lien ne sert qu'une fois) | Sur sa fiche, cliquer **Renvoyer l'invitation** : un nouveau lien apparaît dans le terminal ; y remplacer `NEW_PASSWORD_HERE` comme à l'étape 4:00. |
| **« Mot de passe oublié ? » cliqué pendant la démo** | Aucun e-mail n'est envoyé en local : le lien apparaît dans le terminal de la démo. |
| **Java introuvable** | Le message indique la commande d'installation ; ou définir `JAVA_HOME`. À vérifier la veille. |
| **Coupure d'internet** | Aucun impact après le premier lancement en ligne ; les polices changent légèrement d'aspect. |
| **Liste des universités vide sur « Créer un compte »** | Les fonctions ne sont pas prêtes (attendre « Démo UniFlow prête ») ou l'index n'est pas chargé : Ctrl+C puis `npm run demo` (le lancement réécrit l'index des universités). |
| **« Une demande d'inscription existe déjà »** ou **« Un compte existe déjà avec cette adresse »** | L'adresse a déjà servi (répétition) : utiliser une autre adresse, ou repartir de zéro avec `npm run demo:reset`. |
| **L'étudiant validé reste sur « Demande validée »** | Attendre quelques secondes ; sinon « Se déconnecter » puis se reconnecter avec son e-mail et son mot de passe. |
| **Tout est cassé** | Ctrl+C, `npm run demo:reset`, relancer : environ 1 minute, nouveaux mots de passe dans `docs/COMPTES-DEMO.local.md`. |
