import { z } from 'zod'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  HOUR_MS,
  RTDB_KEY_RE,
  UNIVERSITY_ID_RE,
  consumeRateLimit,
  errorCode,
  safely,
  type AccountDeps,
  type CallerAuth,
} from '../auth/accountShared'
import { asObject, isOpenUniversityStatus, signupRequestPath, signupStatusPath } from './signupShared'

/** Demandes (tentatives) autorisées par compte et par heure. */
export const SIGNUP_RATE_LIMIT_PER_HOUR = 5

/**
 * Ce que le client peut fournir : l'université visée, le rôle DEMANDÉ
 * (jamais un rôle administrateur) et son nom. Ni e-mail (lu dans le compte
 * Auth), ni statut, ni uid : champ inconnu refusé (.strict()).
 */
export const submitSignupInputSchema = z
  .object({
    universityId: z.string().regex(UNIVERSITY_ID_RE),
    requestedRole: z.enum(['student', 'teacher']),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
  })
  .strict()

const ALREADY_MEMBER = 'Votre compte est déjà rattaché à une université.'
const UNIVERSITY_CLOSED = 'Université introuvable ou fermée aux inscriptions.'

/**
 * Enregistre la demande d'inscription du compte appelant (créé côté client,
 * SANS rôle ni claims). Ne donne aucun droit : seule la validation par
 * l'admin de l'université (approveSignupRequest) crée profil, fiche et
 * claims.
 */
export async function submitSignupRequestCore(
  deps: AccountDeps,
  caller: CallerAuth | undefined,
  rawInput: unknown
): Promise<{ status: 'pending' }> {
  if (!caller) throw new HttpsError('unauthenticated', 'Vous devez être connecté.')
  const uid = caller.uid
  if (!RTDB_KEY_RE.test(uid)) throw new HttpsError('permission-denied', 'Identifiant de compte invalide.')
  if (caller.token.role !== undefined || caller.token.universityId !== undefined) {
    throw new HttpsError('failed-precondition', ALREADY_MEMBER)
  }

  const parsed = submitSignupInputSchema.safeParse(rawInput)
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Données invalides.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  const input = parsed.data

  // État réel du compte (le token peut dater) : actif, sans claims, sans profil.
  const user = await deps.auth.getUser(uid)
  if (!user || user.disabled) {
    throw new HttpsError('permission-denied', 'Compte introuvable ou désactivé.')
  }
  if ('role' in user.customClaims || 'universityId' in user.customClaims) {
    throw new HttpsError('failed-precondition', ALREADY_MEMBER)
  }
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(user.email)
  if (!email.success) {
    throw new HttpsError('failed-precondition', "Votre compte n'a pas d'adresse e-mail valide.")
  }
  if (await deps.db.get(`users/${uid}`)) {
    throw new HttpsError('failed-precondition', ALREADY_MEMBER)
  }

  if (!(await consumeRateLimit(deps, `rateLimits/submitSignupRequest/${uid}`, SIGNUP_RATE_LIMIT_PER_HOUR, HOUR_MS))) {
    throw new HttpsError('resource-exhausted', 'Trop de tentatives. Réessayez dans une heure.')
  }

  const meta = asObject(await deps.db.get(`universities/${input.universityId}/meta`))
  if (!meta || !isOpenUniversityStatus(meta.status)) {
    throw new HttpsError('not-found', UNIVERSITY_CLOSED)
  }

  const now = deps.now()
  // Anti-doublon atomique : le statut personnel n'est créé que s'il n'existe
  // pas encore (une seule demande par compte, quelle qu'en soit l'issue).
  const status = {
    universityId: input.universityId,
    universityName: typeof meta.name === 'string' ? meta.name : input.universityId,
    requestedRole: input.requestedRole,
    status: 'pending',
    createdAt: now,
  }
  const claimed = await deps.db.transaction(signupStatusPath(uid), (current) =>
    current === null ? status : undefined
  )
  if (!claimed.committed) {
    throw new HttpsError('already-exists', "Une demande d'inscription existe déjà pour ce compte.")
  }

  try {
    await deps.db.set(signupRequestPath(input.universityId, uid), {
      uid,
      email: email.data,
      emailVerified: user.emailVerified,
      firstName: input.firstName,
      lastName: input.lastName,
      requestedRole: input.requestedRole,
      status: 'pending',
      createdAt: now,
    })
  } catch (err) {
    await safely(deps, 'remove signupStatus', uid, () => deps.db.remove(signupStatusPath(uid)))
    deps.logger.error("Enregistrement de la demande d'inscription échoué", { uid, code: errorCode(err) })
    throw new HttpsError('internal', "La demande n'a pas pu être enregistrée. Réessayez.")
  }

  deps.logger.info("Demande d'inscription enregistrée", {
    uid,
    universityId: input.universityId,
    requestedRole: input.requestedRole,
  })
  return { status: 'pending' }
}
