import type { Role } from '@/core/types'

/**
 * Ressources métier soumises au contrôle d'accès. La plupart ne sont pas
 * encore implémentées (Phase 1 = fondations uniquement) mais sont déclarées
 * ici pour que la matrice de permissions soit complète dès la conception,
 * conformément à l'architecture validée.
 */
export type Resource =
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
  | 'platformUniversities' // métadonnées commerciales — jamais les données pédagogiques

export type Action = 'read' | 'create' | 'update' | 'delete'

type PermissionMatrix = Record<Role, Partial<Record<Resource, Action[]>>>

const ALL: Action[] = ['read', 'create', 'update', 'delete']
const RW: Action[] = ['read', 'create', 'update']
const RO: Action[] = ['read']

/**
 * Source de vérité unique côté client pour les autorisations. Les Security
 * Rules Realtime Database (database.rules.json) dupliquent ces mêmes
 * garanties côté serveur — les deux fichiers doivent rester synchronisés.
 *
 * IMPORTANT : super_admin_plateforme n'a de droits QUE sur
 * `platformUniversities` (métadonnées commerciales). Ce n'est pas un oubli :
 * ce rôle ne doit jamais accéder aux ressources pédagogiques d'un tenant,
 * même en lecture seule (voir architecture v1.1, décision #1).
 */
export const PERMISSIONS: PermissionMatrix = {
  super_admin_plateforme: {
    platformUniversities: ALL,
  },
  admin_universite: {
    students: ALL,
    teachers: ALL,
    programs: ALL,
    courses: ALL,
    classes: ALL,
    grades: ALL,
    exams: ALL,
    enrollments: ALL,
    payments: ALL,
    documents: ALL,
    library: ALL,
    elearning: ALL,
    notifications: ALL,
    academicYears: ALL,
    aiInsights: RO,
  },
  teacher: {
    students: RO,
    teachers: RO,
    programs: RO,
    courses: RO,
    classes: RO,
    grades: RW,
    exams: RW,
    enrollments: RO,
    documents: RO,
    library: RO,
    elearning: RW,
    notifications: RO,
    academicYears: RO,
    aiInsights: RO,
  },
  student: {
    programs: RO,
    courses: RO,
    classes: RO,
    grades: RO,
    exams: RO,
    enrollments: RO,
    payments: RO,
    documents: RO,
    library: RO,
    elearning: RO,
    notifications: RO,
    academicYears: RO,
  },
  parent: {
    // Lecture toujours conditionnée, côté serveur, à l'existence d'une
    // entrée parentLinks/{parentUid}/{studentId} autorisée (architecture v1.1, décision #2).
    grades: RO,
    exams: RO,
    payments: RO,
    documents: RO,
    notifications: RO,
  },
}

export function can(role: Role, resource: Resource, action: Action): boolean {
  const allowed = PERMISSIONS[role]?.[resource]
  return allowed ? allowed.includes(action) : false
}
