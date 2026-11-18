/**
 * Point de passage OBLIGATOIRE pour construire un chemin Realtime Database
 * vers une ressource d'un tenant. Aucun code applicatif ne doit construire
 * un chemin "universities/..." à la main ailleurs : cela garantit qu'on ne
 * peut jamais omettre accidentellement le universityId et fuiter entre tenants.
 */

export const userPath = (uid: string) => `users/${uid}`

/** État de SA demande d'inscription (lecture par son seul titulaire). */
export const signupStatusPath = (uid: string) => `signupStatus/${uid}`

export const universityMetaPath = (universityId: string) => `universities/${universityId}/meta`

export const platformUniversitiesIndexPath = () => 'platform/universitiesIndex'
export const platformUniversityIndexPath = (universityId: string) =>
  `platform/universitiesIndex/${universityId}`

export const parentLinksPath = (universityId: string, parentUid: string) =>
  `universities/${universityId}/parentLinks/${parentUid}`
export const parentLinkPath = (universityId: string, parentUid: string, studentId: string) =>
  `universities/${universityId}/parentLinks/${parentUid}/${studentId}`

/**
 * Sous-collections métier d'un tenant (Phase 2+). Déclarées ici dès
 * maintenant pour que les futurs modules réutilisent ce même point de
 * passage plutôt que de construire leurs chemins ailleurs.
 */
export type TenantSubcollection =
  | 'students'
  | 'teachers'
  | 'programs'
  | 'courses'
  | 'classes'
  | 'grades'
  | 'exams'
  | 'enrollments'
  | 'payments'
  | 'documents'
  | 'library'
  | 'elearning'
  | 'notifications'
  | 'academicYears'
  | 'aiInsights'

export function tenantCollectionPath(universityId: string, sub: TenantSubcollection) {
  if (!universityId) {
    throw new Error(
      '[multi-tenant] tenantCollectionPath() appelé sans universityId — accès refusé par construction.'
    )
  }
  return `universities/${universityId}/${sub}`
}

export function tenantDocPath(universityId: string, sub: TenantSubcollection, id: string) {
  return `${tenantCollectionPath(universityId, sub)}/${id}`
}
