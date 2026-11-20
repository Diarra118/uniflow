/**
 * Fonctionnalités dépendant des Cloud Functions.
 *
 * VITE_FUNCTIONS_ENABLED (variable de build) : vraie par défaut, donc en local
 * (npm run dev, npm run demo) et dans tout build qui ne la définit pas. Seul
 * le build hébergé de démonstration (npm run build:hosted, fichier
 * .env.hosted) la passe à "false" : le projet de démo est sur le plan gratuit
 * Spark, qui ne permet pas de déployer les Cloud Functions.
 *
 * Quand elle est fausse, l'interface masque tout ce qui appellerait une
 * fonction (création d'un compte, création d'un accès de connexion, renvoi
 * d'invitation, demandes d'inscription et leur validation) et affiche
 * LOCAL_ONLY_MESSAGE à la place : aucun appel n'est tenté.
 */
export const FUNCTIONS_ENABLED = import.meta.env.VITE_FUNCTIONS_ENABLED !== 'false'

export const LOCAL_ONLY_MESSAGE = 'Disponible dans la version complète, à lancer en local : voir le README.'
