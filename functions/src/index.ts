/**
 * Point d'entrée des Cloud Functions.
 * Livré : attribution des custom claims (auth/setCustomClaims), création et
 * renvoi des accès (auth/), auto-inscription et sa validation (signup/).
 * Les fonctions des modules à venir (notifications, calculs IA, webhooks de
 * paiement...) auront chacune leur dossier sous src/.
 */
export { onUserProfileWritten } from './auth/setCustomClaims'
export { createUserAccount } from './auth/createUserAccount'
export { resendAccountInvite } from './auth/resendAccountInvite'
export { listSignupUniversities, onUniversityMetaWritten } from './signup/directory'
export { submitSignupRequest } from './signup/submit'
export { approveSignupRequest, rejectSignupRequest } from './signup/review'
