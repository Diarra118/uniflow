import { onCall } from 'firebase-functions/v2/https'
import { ACCOUNT_CALLABLE_OPTIONS } from '../auth/createUserAccount'
import { adminDeps } from '../auth/adminDeps'
import { submitSignupRequestCore } from './submitSignupCore'

/** Enregistre la demande d'inscription du compte connecté (sans claims).
 * Voir submitSignupCore.ts. */
export const submitSignupRequest = onCall(ACCOUNT_CALLABLE_OPTIONS, (request) =>
  submitSignupRequestCore(adminDeps(), request.auth, request.data)
)
