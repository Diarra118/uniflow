/**
 * Logique du déclencheur onUserProfileWritten, séparée pour être testée sans
 * émulateur. Principe : l'événement dit seulement QU'un profil a changé ; la
 * décision se fonde sur l'état COURANT relu au moment de l'exécution, car
 * l'ordre et le délai d'exécution des déclencheurs ne sont pas garantis (ex :
 * un rollback de createUserAccount a pu supprimer le profil entre-temps).
 */

export interface ClaimsDeps {
  /** /users/{uid} tel qu'il est maintenant (null s'il n'existe plus). */
  getProfile(uid: string): Promise<unknown>
  /** État du compte Auth (null s'il n'existe pas). */
  getUser(uid: string): Promise<{ disabled: boolean } | null>
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>
  revokeRefreshTokens(uid: string): Promise<void>
  logger: {
    info(message: string): void
    warn(message: string): void
  }
}

export type SyncOutcome =
  | 'cleared'
  | 'revoked'
  | 'set'
  | 'skipped-profile-missing'
  | 'skipped-profile-recreated'
  | 'skipped-not-active'
  | 'skipped-no-role'
  | 'skipped-user-missing'
  | 'skipped-user-disabled'

function isUserNotFound(err: unknown) {
  return (err as { code?: string } | null)?.code === 'auth/user-not-found'
}

/**
 * @param eventDeleted true si l'événement est une suppression de /users/{uid}.
 */
export async function syncClaimsCore(
  deps: ClaimsDeps,
  uid: string,
  eventDeleted: boolean
): Promise<SyncOutcome> {
  const current = (await deps.getProfile(uid)) as
    | { role?: unknown; universityId?: unknown; status?: unknown }
    | null

  if (eventDeleted) {
    if (current) {
      // Profil recréé depuis : son propre déclencheur s'en charge.
      deps.logger.info(`Profil ${uid} recréé depuis la suppression — claims inchangés.`)
      return 'skipped-profile-recreated'
    }
    try {
      await deps.setCustomUserClaims(uid, {})
    } catch (err) {
      if (!isUserNotFound(err)) throw err
    }
    deps.logger.info(`Claims retirés pour ${uid} (profil supprimé).`)
    return 'cleared'
  }

  if (!current) {
    // Écriture suivie d'une suppression (rollback) : on ne pose rien, le
    // déclencheur de la suppression vide les claims.
    deps.logger.info(`Profil ${uid} absent à l'exécution — aucun claim posé.`)
    return 'skipped-profile-missing'
  }

  if (current.status === 'suspended') {
    // Les Security Rules ne lisent PAS `status` : seuls les claims comptent.
    // On les vide et on révoque les refresh tokens ; un ID token déjà émis
    // reste accepté par les règles jusqu'à son expiration (≤ 1 h). Les
    // callables relisent /users/{uid}.status à chaque appel.
    try {
      await deps.setCustomUserClaims(uid, {})
      await deps.revokeRefreshTokens(uid)
    } catch (err) {
      if (!isUserNotFound(err)) throw err
      return 'skipped-user-missing'
    }
    deps.logger.info(`Claims retirés et sessions révoquées pour ${uid} (compte suspendu).`)
    return 'revoked'
  }

  if (current.status !== 'active') {
    // "pending" (création en cours par createUserAccount, qui pose les claims
    // lui-même en dernier), statut absent ou inconnu : aucune écriture.
    deps.logger.info(`Profil ${uid} non actif (status=${String(current.status)}) — claims non posés.`)
    return 'skipped-not-active'
  }

  if (typeof current.role !== 'string' || current.role.length === 0) {
    deps.logger.warn(`Profil ${uid} sans champ role — claims non mis à jour.`)
    return 'skipped-no-role'
  }

  const user = await deps.getUser(uid)
  if (!user) {
    deps.logger.info(`Compte Auth ${uid} introuvable — claims ignorés.`)
    return 'skipped-user-missing'
  }
  if (user.disabled) {
    // Compte désactivé (ex : rollback dont la suppression a échoué) : ne
    // jamais lui redonner de droits.
    deps.logger.info(`Compte Auth ${uid} désactivé — claims non posés.`)
    return 'skipped-user-disabled'
  }

  const universityId = typeof current.universityId === 'string' ? current.universityId : null
  try {
    await deps.setCustomUserClaims(uid, { role: current.role, universityId })
  } catch (err) {
    if (!isUserNotFound(err)) throw err
    return 'skipped-user-missing'
  }
  deps.logger.info(`Claims mis à jour pour ${uid} : role=${current.role}, universityId=${universityId ?? 'null'}.`)
  return 'set'
}
