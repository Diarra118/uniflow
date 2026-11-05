import { onCall, type CallableOptions } from 'firebase-functions/v2/https'
import { adminDeps } from './adminDeps'
import { createUserAccountCore } from './createUserAccountCore'

/** Options communes aux callables de gestion des accès. */
export const ACCOUNT_CALLABLE_OPTIONS: CallableOptions = {
  region: 'europe-west1',
  // Requiert App Check côté client (voir src/core/firebase/config.ts).
  // Seule exception : l'émulateur Functions (FUNCTIONS_EMULATOR=true,
  // jamais défini en production ni lors de l'analyse au déploiement).
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  maxInstances: 5,
}

/**
 * Crée un compte de connexion (Auth + /users/{uid} + lien sur la fiche +
 * claims) pour une fiche étudiant/enseignant existante. Réservé à un
 * admin_universite actif ; l'université est toujours celle du token de
 * l'appelant et l'email celui de la fiche. Voir createUserAccountCore.ts.
 */
export const createUserAccount = onCall(ACCOUNT_CALLABLE_OPTIONS, (request) =>
  createUserAccountCore(adminDeps(), request.auth, request.data)
)
