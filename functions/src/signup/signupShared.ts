/**
 * Briques communes de l'auto-inscription (demande d'accès validée par
 * l'admin de l'université). Données (écrites UNIQUEMENT par les fonctions,
 * jamais par un client — voir database.rules.json) :
 *
 * - platform/universitiesIndex/{universityId} : { name, plan, status },
 *   miroir de universities/{id}/meta (onUniversityMetaWritten). Seuls `id`
 *   et `name` des universités ouvertes sortent vers le public
 *   (listSignupUniversities).
 * - universities/{universityId}/signupRequests/{uid} : la demande, lisible
 *   par l'admin actif de CETTE université seulement.
 * - signupStatus/{uid} : l'état de SA demande, lisible par le demandeur
 *   seulement (écran d'attente, message de refus).
 */

/** Statuts d'université qui acceptent des inscriptions (comme
 * assertActiveUniversityAdmin, qui refuse suspended et archived). */
export const OPEN_UNIVERSITY_STATUSES = ['active', 'trial'] as const

export function isOpenUniversityStatus(status: unknown): boolean {
  return (OPEN_UNIVERSITY_STATUSES as readonly unknown[]).includes(status)
}

export type SignupRole = 'student' | 'teacher'
export type SignupStatus = 'pending' | 'processing' | 'approved' | 'rejected'

export const universityIndexPath = (universityId: string) => `platform/universitiesIndex/${universityId}`
export const UNIVERSITY_INDEX_PATH = 'platform/universitiesIndex'
export const signupRequestPath = (universityId: string, uid: string) =>
  `universities/${universityId}/signupRequests/${uid}`
export const signupStatusPath = (uid: string) => `signupStatus/${uid}`

export function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}
