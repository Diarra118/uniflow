import { onCall } from 'firebase-functions/v2/https'
import { ACCOUNT_CALLABLE_OPTIONS } from '../auth/createUserAccount'
import { adminDeps } from '../auth/adminDeps'
import { approveSignupRequestCore, rejectSignupRequestCore } from './reviewSignupCore'

/** Valide une demande de SON université (admin actif). Voir reviewSignupCore.ts. */
export const approveSignupRequest = onCall(ACCOUNT_CALLABLE_OPTIONS, (request) =>
  approveSignupRequestCore(adminDeps(), request.auth, request.data)
)

/** Refuse une demande de SON université : compte désactivé. */
export const rejectSignupRequest = onCall(ACCOUNT_CALLABLE_OPTIONS, (request) =>
  rejectSignupRequestCore(adminDeps(), request.auth, request.data)
)
