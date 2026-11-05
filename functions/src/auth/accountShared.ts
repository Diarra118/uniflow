import { z } from 'zod'
import { HttpsError } from 'firebase-functions/v2/https'

/**
 * Briques communes aux callables de gestion des accès (createUserAccount,
 * resendAccountInvite). Aucune dépendance directe à firebase-admin : Auth et
 * Realtime Database sont injectés via AccountDeps (implémentation Admin SDK
 * dans adminDeps.ts), ce qui permet de tester toute la logique sans émulateur.
 */

/** Sous-ensemble de request.auth utilisé (uid + claims du token vérifié). */
export interface CallerAuth {
  uid: string
  token: Record<string, unknown>
}

export interface TransactionResult {
  committed: boolean
  /** Valeur finale du noeud (écrite si committed, actuelle sinon). */
  value: unknown
}

export interface AccountDeps {
  auth: {
    createUser(props: {
      email: string
      password: string
      displayName: string
      emailVerified: boolean
      disabled: boolean
    }): Promise<{ uid: string }>
    updateUser(uid: string, props: { disabled: boolean }): Promise<void>
    setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>
    deleteUser(uid: string): Promise<void>
  }
  invitations: {
    /** Fait envoyer par Firebase l'email de définition du mot de passe.
     * Le lien n'est jamais vu par le serveur ni par l'admin. Lève en cas
     * d'échec (erreur portant un `code`, sans donnée sensible). */
    sendPasswordSetupEmail(email: string): Promise<void>
  }
  db: {
    get(path: string): Promise<unknown>
    set(path: string, value: unknown): Promise<void>
    update(path: string, values: Record<string, unknown>): Promise<void>
    remove(path: string): Promise<void>
    /** Sémantique RTDB : `update` peut d'abord être appelé avec le cache
     * local (souvent null) puis rappelé avec la vraie valeur ; retourner
     * undefined abandonne la transaction. */
    transaction(path: string, update: (current: unknown) => unknown): Promise<TransactionResult>
  }
  logger: {
    info(message: string, data?: Record<string, unknown>): void
    error(message: string, data?: Record<string, unknown>): void
  }
  now(): number
}

/** Clé RTDB sûre : aucun caractère interdit (. # $ [ ] /) ni de contrôle. */
// eslint-disable-next-line no-control-regex
export const RTDB_KEY_RE = /^[^/.#$[\]\u0000-\u001f\u007f]{1,128}$/
/** Format des identifiants d'université (défensif : vient des claims). */
export const UNIVERSITY_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export const HOUR_MS = 60 * 60 * 1000

export const linkedRecordTypeSchema = z.enum(['student', 'teacher', 'parent'])
export type LinkedRecordType = z.infer<typeof linkedRecordTypeSchema>

export const linkedRecordIdSchema = z.string().trim().regex(RTDB_KEY_RE)

export const LINKED_COLLECTION: Record<LinkedRecordType, string> = {
  student: 'students',
  teacher: 'teachers',
  // Pas encore de module Parents : la fiche n'existera pas tant qu'il n'est
  // pas livré, les fonctions répondront donc not-found pour ce type.
  parent: 'parents',
}

export function recordPath(universityId: string, type: LinkedRecordType, id: string) {
  return `universities/${universityId}/${LINKED_COLLECTION[type]}/${id}`
}

export function errorCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : undefined
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

/** Email de la fiche, normalisé. Seule source de l'email d'un compte. */
export function readRecordEmail(record: Record<string, unknown>): string {
  const parsed = z.string().trim().toLowerCase().pipe(z.email()).safeParse(record.email)
  if (!parsed.success) {
    throw new HttpsError(
      'failed-precondition',
      "La fiche n'a pas d'adresse email valide. Corrigez l'email de la fiche puis réessayez."
    )
  }
  return parsed.data
}

/** Nom affiché du compte (displayName et /users/{uid}.name) : prénom + nom
 * de la fiche. Seule source du nom d'un compte. */
export function readRecordName(record: Record<string, unknown>): string {
  const part = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = [part(record.firstName), part(record.lastName)].filter(Boolean).join(' ').slice(0, 160)
  if (!name) {
    throw new HttpsError(
      'failed-precondition',
      "La fiche n'a ni prénom ni nom. Complétez la fiche puis réessayez."
    )
  }
  return name
}

export async function getRecord(deps: AccountDeps, path: string) {
  const record = asObject(await deps.db.get(path))
  if (!record) {
    throw new HttpsError('not-found', 'Fiche introuvable dans votre université.')
  }
  return record
}

export interface UniversityMetaData {
  plan?: unknown
  status?: unknown
  maxStudents?: unknown
  maxTeachers?: unknown
}

/**
 * L'appelant doit être un admin_universite ACTIF : on ne se contente pas du
 * token (valide jusqu'à 1 h après une suspension), on relit /users/{uid}
 * et le statut de l'université à chaque appel.
 */
export async function assertActiveUniversityAdmin(
  deps: AccountDeps,
  caller: CallerAuth | undefined
): Promise<{ callerUid: string; universityId: string; meta: UniversityMetaData }> {
  if (!caller) {
    throw new HttpsError('unauthenticated', 'Vous devez être connecté.')
  }
  if (caller.token.role !== 'admin_universite') {
    throw new HttpsError(
      'permission-denied',
      "Seul un administrateur d'université peut gérer les accès."
    )
  }
  const universityId = caller.token.universityId
  if (typeof universityId !== 'string' || !UNIVERSITY_ID_RE.test(universityId)) {
    throw new HttpsError('permission-denied', 'Aucune université valide rattachée à votre compte.')
  }
  if (!RTDB_KEY_RE.test(caller.uid)) {
    throw new HttpsError('permission-denied', 'Identifiant de compte invalide.')
  }

  const profile = asObject(await deps.db.get(`users/${caller.uid}`))
  if (
    !profile ||
    profile.status !== 'active' ||
    profile.role !== 'admin_universite' ||
    profile.universityId !== universityId
  ) {
    throw new HttpsError('permission-denied', "Votre compte administrateur n'est pas actif.")
  }

  const meta = asObject(await deps.db.get(`universities/${universityId}/meta`))
  if (!meta) {
    throw new HttpsError('permission-denied', 'Université introuvable.')
  }
  if (meta.status === 'suspended' || meta.status === 'archived') {
    throw new HttpsError(
      'permission-denied',
      'Votre université est suspendue ou archivée : gestion des accès impossible.'
    )
  }
  return { callerUid: caller.uid, universityId, meta }
}

/**
 * Limite de débit à fenêtre fixe, stockée sous /rateLimits (inaccessible aux
 * clients : règle racine .read/.write false). Retourne false si la limite
 * est atteinte.
 */
export async function consumeRateLimit(
  deps: AccountDeps,
  path: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const now = deps.now()
  const res = await deps.db.transaction(path, (current) => {
    const c = asObject(current)
    const windowStart = typeof c?.windowStart === 'number' ? c.windowStart : null
    const count = typeof c?.count === 'number' ? c.count : 0
    if (windowStart === null || now - windowStart >= windowMs) return { windowStart: now, count: 1 }
    if (count >= limit) return undefined
    return { windowStart, count: count + 1 }
  })
  return res.committed
}

/** Envoie l'invitation ; ne lève jamais. Seuls uid et code sont journalisés. */
export async function sendInvitation(deps: AccountDeps, uid: string, email: string) {
  try {
    await deps.invitations.sendPasswordSetupEmail(email)
    return true
  } catch (err) {
    deps.logger.error("Envoi de l'invitation échoué", { uid, code: errorCode(err) })
    return false
  }
}

// ---------------------------------------------------------------------
// Quotas du plan
// ---------------------------------------------------------------------

/** Valeurs par défaut si meta.maxStudents / meta.maxTeachers sont absents.
 * null = illimité. */
export const PLAN_DEFAULT_QUOTAS: Record<string, { maxStudents: number | null; maxTeachers: number | null }> = {
  standard: { maxStudents: 500, maxTeachers: 50 },
  premium: { maxStudents: 5000, maxTeachers: 500 },
  enterprise: { maxStudents: null, maxTeachers: null },
}

export function accountQuota(meta: UniversityMetaData, role: LinkedRecordType): number | null {
  if (role === 'parent') return null
  const key = role === 'student' ? 'maxStudents' : 'maxTeachers'
  const explicit = meta[key]
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) return explicit
  const plan = typeof meta.plan === 'string' ? meta.plan : 'standard'
  return (PLAN_DEFAULT_QUOTAS[plan] ?? PLAN_DEFAULT_QUOTAS.standard)[key]
}

/** Compteur des comptes créés par rôle (inaccessible aux clients). */
export function usagePath(universityId: string, role: LinkedRecordType) {
  return `universities/${universityId}/usage/${role}Accounts`
}

/** Réserve une place dans le quota ; false si le quota est atteint. */
export async function reserveQuota(deps: AccountDeps, path: string, max: number | null) {
  const res = await deps.db.transaction(path, (current) => {
    const n = typeof current === 'number' ? current : 0
    if (max !== null && n >= max) return undefined
    return n + 1
  })
  return res.committed
}

export async function releaseQuota(deps: AccountDeps, path: string) {
  await deps.db.transaction(path, (current) =>
    // null au premier passage : on réécrit null, le serveur relancera avec
    // la vraie valeur si elle diffère.
    typeof current === 'number' && current > 0 ? current - 1 : (current ?? null)
  )
}
