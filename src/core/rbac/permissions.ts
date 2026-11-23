import type { Role } from '@/core/types'

/**
 * Ressources métier soumises au contrôle d'accès. Toutes sont déclarées
 * ici, y compris celles des modules pas encore livrés (notes, paiements,
 * e-learning…), pour que la matrice de permissions soit complète dès la
 * conception, conformément à l'architecture validée.
 */
export type Resource =
  | 'students' // l'ensemble des fiches étudiants (liste et fiches d'autrui)
  | 'ownStudentRecord' // SA propre fiche, pour un étudiant (« Mon dossier »)
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
  | 'signupRequests' // demandes d'auto-inscription de l'université

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
    // Lecture seule : platform/universitiesIndex est en `.write: false`
    // côté règles (alimentation réservée au serveur).
    platformUniversities: RO,
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
    // Lecture seule : valider ou refuser passe par les fonctions serveur
    // approveSignupRequest / rejectSignupRequest (règles : .write false).
    signupRequests: RO,
  },
  // Enseignant : lectures et écritures de grades et exams, écritures
  // d'elearning, limitées par les Security Rules aux cours dont il est
  // responsable (courses/{courseId}/teacherId → teachers/{id}/uid ===
  // auth.uid) ; une note seulement pour un étudiant de la filière du cours.
  // Cette matrice dit QUELLES actions existent, les règles disent SUR QUOI.
  teacher: {
    students: RO,
    teachers: RO,
    programs: RO,
    courses: RO,
    classes: RO,
    grades: RW, // créer / modifier sur ses cours, jamais supprimer
    exams: RW, // idem
    enrollments: RO,
    documents: RO,
    library: RO,
    elearning: ALL, // créer / modifier / supprimer sur ses cours
    notifications: RO,
    academicYears: RO,
    aiInsights: RO,
  },
  student: {
    // Sa fiche uniquement (règles : students/{id}.uid === auth.uid) ; jamais
    // la liste, d'où une ressource distincte de `students`.
    ownStudentRecord: RO,
    programs: RO,
    courses: RO,
    classes: RO,
    // Ses notes (students/{studentId}/uid === auth.uid) et les examens des
    // cours de sa filière ; aucune écriture.
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
    // Ni `grades` ni `exams` : aucun accès aux notes dans le lot v1.4 (le
    // lien parent-enfant reste à unifier sur l'id de fiche, voir README).
    payments: RO,
    documents: RO,
    notifications: RO,
  },
}

export function can(role: Role, resource: Resource, action: Action): boolean {
  const allowed = PERMISSIONS[role]?.[resource]
  return allowed ? allowed.includes(action) : false
}
