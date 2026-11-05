import { z } from 'zod'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  HOUR_MS,
  assertActiveUniversityAdmin,
  consumeRateLimit,
  getRecord,
  linkedRecordIdSchema,
  linkedRecordTypeSchema,
  readRecordEmail,
  recordPath,
  sendInvitation,
  type AccountDeps,
  type CallerAuth,
} from './accountShared'

/** Renvois autorisés par fiche et par heure. */
export const RESEND_RATE_LIMIT_PER_RECORD_PER_HOUR = 3
/** Renvois autorisés par administrateur et par heure (toutes fiches). */
export const RESEND_RATE_LIMIT_PER_ADMIN_PER_HOUR = 30

export const resendAccountInviteInputSchema = z
  .object({
    linkedRecordType: linkedRecordTypeSchema,
    linkedRecordId: linkedRecordIdSchema,
  })
  .strict()

export interface ResendAccountInviteResult {
  invitationSent: boolean
}

/**
 * Renvoie l'email de définition du mot de passe pour une fiche déjà liée à
 * un compte. Mêmes garanties que createUserAccount : admin actif, université
 * active, fiche du tenant de l'appelant, email lu dans la fiche.
 */
export async function resendAccountInviteCore(
  deps: AccountDeps,
  caller: CallerAuth | undefined,
  rawInput: unknown
): Promise<ResendAccountInviteResult> {
  const { callerUid, universityId } = await assertActiveUniversityAdmin(deps, caller)

  const parsed = resendAccountInviteInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Données invalides.')
  }
  const { linkedRecordType, linkedRecordId } = parsed.data

  const record = await getRecord(deps, recordPath(universityId, linkedRecordType, linkedRecordId))
  const uid = record.uid
  if (typeof uid !== 'string' || uid.length === 0) {
    throw new HttpsError('failed-precondition', "Cette fiche n'a pas encore d'accès de connexion.")
  }
  const email = readRecordEmail(record)

  const profile = (await deps.db.get(`users/${uid}`)) as
    | { email?: unknown; universityId?: unknown; status?: unknown }
    | null
  if (!profile || profile.universityId !== universityId) {
    throw new HttpsError('failed-precondition', 'Le compte lié à cette fiche est introuvable.')
  }
  if (profile.email !== email) {
    // Ne jamais envoyer vers une adresse qui n'est pas celle du compte : un
    // email de fiche modifié pourrait viser le compte de quelqu'un d'autre.
    throw new HttpsError(
      'failed-precondition',
      "L'email de la fiche ne correspond plus à celui du compte de connexion. Rétablissez l'adresse d'origine ou contactez le support."
    )
  }
  if (profile.status === 'suspended') {
    throw new HttpsError('failed-precondition', 'Ce compte est suspendu : invitation impossible.')
  }

  const limits = [
    {
      path: `rateLimits/resendAccountInvite/byRecord/${universityId}/${linkedRecordType}/${linkedRecordId}`,
      limit: RESEND_RATE_LIMIT_PER_RECORD_PER_HOUR,
      message: 'Trop de renvois pour cette fiche. Réessayez dans une heure.',
    },
    {
      path: `rateLimits/resendAccountInvite/byAdmin/${callerUid}`,
      limit: RESEND_RATE_LIMIT_PER_ADMIN_PER_HOUR,
      message: "Trop de renvois d'invitations en peu de temps. Réessayez dans une heure.",
    },
  ]
  for (const { path, limit, message } of limits) {
    if (!(await consumeRateLimit(deps, path, limit, HOUR_MS))) {
      throw new HttpsError('resource-exhausted', message)
    }
  }

  const invitationSent = await sendInvitation(deps, uid, email)
  deps.logger.info('Invitation renvoyée', {
    uid,
    universityId,
    linkedRecordType,
    linkedRecordId,
    requestedBy: callerUid,
    invitationSent,
  })
  return { invitationSent }
}
