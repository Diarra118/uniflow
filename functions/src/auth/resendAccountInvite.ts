import { onCall } from 'firebase-functions/v2/https'
import { adminDeps } from './adminDeps'
import { ACCOUNT_CALLABLE_OPTIONS } from './createUserAccount'
import { resendAccountInviteCore } from './resendAccountInviteCore'

/** Renvoie l'invitation par email d'une fiche déjà liée. Voir
 * resendAccountInviteCore.ts. */
export const resendAccountInvite = onCall(ACCOUNT_CALLABLE_OPTIONS, (request) =>
  resendAccountInviteCore(adminDeps(), request.auth, request.data)
)
