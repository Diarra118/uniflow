import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  HOUR_MS,
  accountQuota,
  assertActiveUniversityAdmin,
  consumeRateLimit,
  errorCode,
  getRecord,
  linkedRecordIdSchema,
  linkedRecordTypeSchema,
  readRecordEmail,
  readRecordName,
  recordPath,
  activateAccount,
  releaseQuota,
  reserveQuota,
  safely,
  sendInvitation,
  usagePath,
  type AccountDeps,
  type CallerAuth,
} from './accountShared'

export type { AccountDeps, CallerAuth } from './accountShared'

/** Créations d'accès autorisées par administrateur et par heure. */
export const CREATE_RATE_LIMIT_PER_HOUR = 30

export const createUserAccountInputSchema = z
  .object({
    // admin_universite et super_admin_plateforme ne sont volontairement PAS
    // créables par cette voie.
    role: z.enum(['teacher', 'student', 'parent']),
    linkedRecordType: linkedRecordTypeSchema,
    linkedRecordId: linkedRecordIdSchema,
    // Ni email ni nom : ils sont TOUJOURS lus dans la fiche (champ inconnu
    // refusé par .strict()).
  })
  .strict()
  .refine((v) => v.role === v.linkedRecordType, {
    message: 'Le rôle doit correspondre au type de fiche liée.',
    path: ['role'],
  })

export type CreateUserAccountInput = z.infer<typeof createUserAccountInputSchema>

export interface CreateUserAccountResult {
  uid: string
  /** false si l'envoi de l'invitation a échoué : le compte est conservé,
   * l'admin peut la renvoyer depuis la fiche (resendAccountInvite). */
  invitationSent: boolean
}

/** Mot de passe initial jamais transmis : l'utilisateur définit le sien via
 * le lien reçu par email. */
function generateStrongPassword(): string {
  return randomBytes(32).toString('base64url')
}

const ALREADY_LINKED = 'Cette fiche possède déjà un accès de connexion.'

export async function createUserAccountCore(
  deps: AccountDeps,
  caller: CallerAuth | undefined,
  rawInput: unknown
): Promise<CreateUserAccountResult> {
  const { callerUid, universityId, meta } = await assertActiveUniversityAdmin(deps, caller)

  const parsed = createUserAccountInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Données invalides.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  const input = parsed.data

  // universityId vient exclusivement des claims (validés ci-dessus) : une
  // fiche d'un autre tenant est introuvable par construction.
  const path = recordPath(universityId, input.linkedRecordType, input.linkedRecordId)
  const record = await getRecord(deps, path)
  if (record.uid) {
    throw new HttpsError('already-exists', ALREADY_LINKED)
  }
  const email = readRecordEmail(record)
  const name = readRecordName(record)

  if (
    !(await consumeRateLimit(
      deps,
      `rateLimits/createUserAccount/${callerUid}`,
      CREATE_RATE_LIMIT_PER_HOUR,
      HOUR_MS
    ))
  ) {
    throw new HttpsError(
      'resource-exhausted',
      "Trop de créations d'accès en peu de temps. Réessayez dans une heure."
    )
  }

  const quotaPath = usagePath(universityId, input.role)
  if (!(await reserveQuota(deps, quotaPath, accountQuota(meta, input.role)))) {
    throw new HttpsError(
      'resource-exhausted',
      'Le quota de comptes de votre offre est atteint pour ce type de profil.'
    )
  }

  let uid: string
  try {
    const created = await deps.auth.createUser({
      email,
      password: generateStrongPassword(),
      displayName: name,
      emailVerified: false,
      disabled: false,
    })
    uid = created.uid
  } catch (err) {
    await safely(deps, 'release quota', undefined, () => releaseQuota(deps, quotaPath))
    const code = errorCode(err)
    if (code === 'auth/email-already-exists') {
      // Message volontairement générique : ne confirme pas qu'un compte
      // existe ailleurs sur la plateforme avec cette adresse.
      throw new HttpsError(
        'already-exists',
        "Impossible de créer un accès avec l'adresse email de cette fiche. Vérifiez l'adresse ou contactez le support."
      )
    }
    if (code === 'auth/invalid-email') {
      throw new HttpsError('failed-precondition', "L'adresse email de la fiche est invalide.")
    }
    deps.logger.error('createUser a échoué', { code })
    throw new HttpsError('internal', 'Création du compte impossible.')
  }

  try {
    // 1. Profil en attente : le déclencheur onUserProfileWritten ne pose
    //    aucun claim tant que status vaut "pending".
    await deps.db.set(`users/${uid}`, {
      uid,
      email,
      name,
      role: input.role,
      universityId,
      linkedRecordId: input.linkedRecordId,
      linkedRecordType: input.linkedRecordType,
      status: 'pending',
      createdAt: deps.now(),
    })

    // 2. Réservation atomique de la fiche ENTIÈRE : on n'écrit l'uid que si
    //    la fiche existe encore et n'est liée à personne (pas de fiche
    //    fantôme { uid } si elle a été supprimée entre-temps).
    const claim = await deps.db.transaction(path, (current) => {
      // Premier passage sur le cache local : on réécrit null, le serveur
      // relancera avec la vraie valeur si la fiche existe.
      if (current === null) return null
      if (typeof current !== 'object' || (current as { uid?: unknown }).uid) return undefined
      return { ...(current as Record<string, unknown>), uid }
    })
    if (!claim.committed) {
      const current = claim.value as { uid?: unknown } | null
      throw current && typeof current === 'object' && current.uid
        ? new HttpsError('already-exists', ALREADY_LINKED)
        : new HttpsError('not-found', 'Fiche introuvable dans votre université.')
    }
    if (claim.value === null) {
      throw new HttpsError('not-found', 'Fiche supprimée pendant la création du compte.')
    }

    // 3. Activation du profil, puis claims EN DERNIER : aucun droit
    //    n'existe tant que tout le reste n'a pas réussi.
    await activateAccount(deps, uid, input.role, universityId)
  } catch (err) {
    await rollback(deps, uid, `${path}/uid`)
    await safely(deps, 'release quota', uid, () => releaseQuota(deps, quotaPath))
    if (err instanceof HttpsError) throw err
    deps.logger.error('Finalisation du compte échouée, rollback effectué', {
      uid,
      code: errorCode(err),
    })
    throw new HttpsError('internal', 'Création du compte impossible. Aucune modification conservée.')
  }

  // Non bloquant : le compte est complet, l'invitation peut être renvoyée.
  const invitationSent = await sendInvitation(deps, uid, email)

  deps.logger.info('Accès de connexion créé', {
    uid,
    role: input.role,
    universityId,
    linkedRecordType: input.linkedRecordType,
    linkedRecordId: input.linkedRecordId,
    createdBy: callerUid,
    invitationSent,
  })

  return { uid, invitationSent }
}

/**
 * Chaque sous-étape est isolée : l'échec de l'une n'empêche pas les
 * suivantes. Les deux premières garantissent qu'un compte qu'on n'arrive pas
 * à supprimer reste inutilisable (aucun claim, connexion impossible).
 */
async function rollback(deps: AccountDeps, uid: string, recordUidPath: string) {
  await safely(deps, 'clear claims', uid, () => deps.auth.setCustomUserClaims(uid, {}))
  await safely(deps, 'disable user', uid, () => deps.auth.updateUser(uid, { disabled: true }))
  // Retiré systématiquement (sans effet s'il est absent) : un set peut avoir
  // abouti côté serveur malgré une erreur réseau.
  await safely(deps, 'remove users/uid', uid, () => deps.db.remove(`users/${uid}`))
  // Toujours tenté : la réservation a pu aboutir côté serveur même si sa
  // réponse s'est perdue. Ne libère que si l'uid est bien le nôtre.
  await safely(deps, 'release record uid', uid, () =>
    deps.db.transaction(recordUidPath, (current) =>
      current === uid || current === null ? null : undefined
    )
  )
  await safely(deps, 'deleteUser', uid, () => deps.auth.deleteUser(uid))
}
