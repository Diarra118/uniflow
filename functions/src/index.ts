/**
 * Point d'entrée des Cloud Functions.
 * Phase 1 : uniquement l'attribution des custom claims (fondation du RBAC
 * et du multi-tenant). Les fonctions métier (notifications, calculs IA,
 * webhooks de paiement...) seront ajoutées phase par phase, dans leur
 * propre dossier sous src/ (ex : src/ai/, src/triggers/).
 */
export { onUserProfileWritten } from './auth/setCustomClaims'
export { createUserAccount } from './auth/createUserAccount'
export { resendAccountInvite } from './auth/resendAccountInvite'
export { listSignupUniversities, onUniversityMetaWritten } from './signup/directory'
export { submitSignupRequest } from './signup/submit'
