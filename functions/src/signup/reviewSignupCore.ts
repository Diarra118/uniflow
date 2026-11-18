import { z } from 'zod'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  RTDB_KEY_RE,
  accountQuota,
  activateAccount,
  assertActiveUniversityAdmin,
  errorCode,
  readRecordName,
  recordPath,
  releaseQuota,
  reserveQuota,
  safely,
  usagePath,
  type AccountDeps,
  type CallerAuth,
} from '../auth/accountShared'
import { asObject, signupRequestPath, signupStatusPath, type SignupRole } from './signupShared'

/** L'admin désigne la demande par l'uid du demandeur (clé de la demande
 * dans SON université) ; l'université vient TOUJOURS de ses claims. */
export const approveSignupInputSchema = z
  .object({
    uid: z.string().regex(RTDB_KEY_RE),
    /** Matricule attribué par l'université (étudiant ou employé). */
    number: z.string().trim().min(1).max(40),
    /** Département (enseignant), facultatif. */
    department: z.string().trim().max(80).optional(),
  })
  .strict()

export const rejectSignupInputSchema = z
  .object({
    uid: z.string().regex(RTDB_KEY_RE),
    /** Motif montré au demandeur, facultatif. */
    reason: z.string().trim().max(300).optional(),
  })
  .strict()

const NOT_FOUND = 'Demande introuvable dans votre université.'
const ALREADY_DONE = 'Cette demande a déjà été traitée.'

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Données invalides.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

/** Identifiant déterministe de la fiche créée : une validation rejouée ne
 * crée jamais de seconde fiche. */
export const signupRecordId = (uid: string) => `insc-${uid}`

/**
 * Valide une demande : compte Auth existant (créé par le demandeur, sans
 * claims) → profil « pending » → fiche étudiant/enseignant liée (uid) →
 * profil actif + claims (activateAccount, comme createUserAccount). Un
 * échec annule tout SAUF le compte Auth, et remet la demande en attente.
 */
export async function approveSignupRequestCore(
  deps: AccountDeps,
  caller: CallerAuth | undefined,
  rawInput: unknown
): Promise<{ uid: string; linkedRecordId: string }> {
  const { callerUid, universityId, meta } = await assertActiveUniversityAdmin(deps, caller)
  const input = parse(approveSignupInputSchema, rawInput)
  const { uid } = input
  const reqPath = signupRequestPath(universityId, uid)

  // Verrou : pending → processing (une seule validation, même en double clic).
  // Premier passage sur le cache local (null) : on réécrit null, le serveur
  // relance avec la vraie valeur si elle diffère.
  const lock = await deps.db.transaction(`${reqPath}/status`, (current) =>
    current === null ? null : current === 'pending' ? 'processing' : undefined
  )
  if (lock.value === null || lock.value === undefined) throw new HttpsError('not-found', NOT_FOUND)
  if (!lock.committed || lock.value !== 'processing') throw new HttpsError('failed-precondition', ALREADY_DONE)

  const unlock = () =>
    safely(deps, 'unlock request', uid, () => deps.db.update(reqPath, { status: 'pending' }))

  let role: SignupRole
  let email: string
  let name: string
  let request: Record<string, unknown>
  try {
    request = asObject(await deps.db.get(reqPath)) ?? {}
    if (request.requestedRole !== 'student' && request.requestedRole !== 'teacher') {
      throw new HttpsError('failed-precondition', 'Rôle demandé invalide.')
    }
    role = request.requestedRole
    name = readRecordName(request)
    const user = await deps.auth.getUser(uid)
    if (!user) throw new HttpsError('not-found', 'Le compte du demandeur n’existe plus.')
    if (user.disabled) throw new HttpsError('failed-precondition', 'Le compte du demandeur est désactivé.')
    if ('role' in user.customClaims || 'universityId' in user.customClaims) {
      throw new HttpsError('failed-precondition', 'Ce compte est déjà rattaché à une université.')
    }
    if (await deps.db.get(`users/${uid}`)) {
      throw new HttpsError('failed-precondition', 'Ce compte est déjà rattaché à une université.')
    }
    const parsedEmail = z.string().trim().toLowerCase().pipe(z.email()).safeParse(user.email ?? request.email)
    if (!parsedEmail.success) throw new HttpsError('failed-precondition', "Le compte n'a pas d'adresse e-mail valide.")
    email = parsedEmail.data
  } catch (err) {
    await unlock()
    throw err
  }

  const quotaPath = usagePath(universityId, role)
  if (!(await reserveQuota(deps, quotaPath, accountQuota(meta, role)))) {
    await unlock()
    throw new HttpsError('resource-exhausted', 'Le quota de comptes de votre offre est atteint pour ce type de profil.')
  }

  const linkedRecordId = signupRecordId(uid)
  const path = recordPath(universityId, role, linkedRecordId)
  const now = deps.now()
  const firstName = String(request.firstName ?? '').trim()
  const lastName = String(request.lastName ?? '').trim()
  const searchKey = `${lastName} ${firstName} ${input.number}`.toLowerCase()
  const record =
    role === 'student'
      ? { studentNumber: input.number, firstName, lastName, email, classId: '', programId: '',
          enrollmentStatus: 'enrolled', accountStatus: 'active', uid, searchKey, createdAt: now, updatedAt: now }
      : { employeeNumber: input.number, firstName, lastName, email, department: input.department ?? '',
          accountStatus: 'active', uid, searchKey, createdAt: now, updatedAt: now }

  try {
    // 1. Profil en attente (le déclencheur ne pose rien tant que pending).
    await deps.db.set(`users/${uid}`, {
      uid, email, name, role, universityId,
      linkedRecordId, linkedRecordType: role, status: 'pending', createdAt: now,
    })
    // 2. Fiche liée, créée seulement si elle n'existe pas.
    const created = await deps.db.transaction(path, (current) => (current === null ? record : undefined))
    if (!created.committed) throw new HttpsError('already-exists', 'Une fiche existe déjà pour ce compte.')
    // 3. Profil actif + claims en dernier (logique commune).
    await activateAccount(deps, uid, role, universityId)
  } catch (err) {
    await safely(deps, 'clear claims', uid, () => deps.auth.setCustomUserClaims(uid, {}))
    await safely(deps, 'remove users/uid', uid, () => deps.db.remove(`users/${uid}`))
    await safely(deps, 'remove record', uid, () =>
      deps.db.transaction(path, (current) => {
        const c = asObject(current)
        return current === null || c?.uid === uid ? null : undefined
      })
    )
    await safely(deps, 'release quota', uid, () => releaseQuota(deps, quotaPath))
    await unlock()
    if (err instanceof HttpsError) throw err
    deps.logger.error("Validation d'inscription échouée, annulée", { uid, code: errorCode(err) })
    throw new HttpsError('internal', 'Validation impossible. Aucune modification conservée.')
  }

  // 4. Traçabilité (le compte est déjà complet : un échec ici n'annule rien).
  await safely(deps, 'mark approved', uid, () =>
    deps.db.update(reqPath, { status: 'approved', decidedAt: now, decidedBy: callerUid, linkedRecordId })
  )
  await safely(deps, 'status approved', uid, () =>
    deps.db.update(signupStatusPath(uid), { status: 'approved', decidedAt: now })
  )
  deps.logger.info("Demande d'inscription validée", { uid, universityId, role, decidedBy: callerUid })
  return { uid, linkedRecordId }
}

/**
 * Refuse une demande : statut « rejected » (avec motif éventuel) côté
 * admin et côté demandeur, puis compte Auth désactivé, claims vidés et
 * sessions révoquées. Rejouable : relancer sur une demande déjà refusée
 * réapplique la désactivation.
 */
export async function rejectSignupRequestCore(
  deps: AccountDeps,
  caller: CallerAuth | undefined,
  rawInput: unknown
): Promise<{ uid: string }> {
  const { callerUid, universityId } = await assertActiveUniversityAdmin(deps, caller)
  const input = parse(rejectSignupInputSchema, rawInput)
  const { uid } = input
  const reqPath = signupRequestPath(universityId, uid)

  const lock = await deps.db.transaction(`${reqPath}/status`, (current) =>
    current === null ? null : current === 'pending' || current === 'rejected' ? 'rejected' : undefined
  )
  if (lock.value === null || lock.value === undefined) throw new HttpsError('not-found', NOT_FOUND)
  if (!lock.committed || lock.value !== 'rejected') throw new HttpsError('failed-precondition', ALREADY_DONE)

  const now = deps.now()
  const details = { decidedAt: now, decidedBy: callerUid, reason: input.reason || null }
  await deps.db.update(reqPath, details)
  // Le demandeur voit le refus (et le motif) avant d'être déconnecté.
  await deps.db.update(signupStatusPath(uid), { status: 'rejected', decidedAt: now, reason: input.reason || null })

  const ignoreMissing = async (step: () => Promise<void>) => {
    try {
      await step()
    } catch (err) {
      if (errorCode(err) !== 'auth/user-not-found') throw err
    }
  }
  try {
    await ignoreMissing(() => deps.auth.updateUser(uid, { disabled: true }))
    await ignoreMissing(() => deps.auth.setCustomUserClaims(uid, {}))
    await ignoreMissing(() => deps.auth.revokeRefreshTokens(uid))
  } catch (err) {
    deps.logger.error('Désactivation du compte refusé incomplète', { uid, code: errorCode(err) })
    throw new HttpsError('internal', 'Refus enregistré, mais la désactivation du compte a échoué. Réessayez.')
  }
  deps.logger.info("Demande d'inscription refusée", { uid, universityId, decidedBy: callerUid })
  return { uid }
}
