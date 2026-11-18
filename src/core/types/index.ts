/**
 * Types de domaine — Phase 1 (fondations).
 * Les types des modules métier (étudiants, notes, paiements, etc.) seront
 * ajoutés phase par phase, au même endroit que leur implémentation.
 */

export type Role =
  | 'super_admin_plateforme'
  | 'admin_universite'
  | 'teacher'
  | 'student'
  | 'parent'

export type UserStatus = 'active' | 'pending' | 'suspended'

export interface AppUser {
  uid: string
  universityId: string | null // null uniquement pour super_admin_plateforme
  role: Role
  name: string
  email: string
  status: UserStatus
  createdAt: number
  /** Fiche liée (posée par createUserAccount) : permet à un étudiant de
   * retrouver SA fiche sans lister la collection (règles RTDB). Absent pour
   * les comptes administrateurs et ceux créés avant ce mécanisme. */
  linkedRecordId?: string
  linkedRecordType?: 'student' | 'teacher' | 'parent'
}

export type UniversityPlan = 'standard' | 'premium' | 'enterprise'
export type UniversityStatus = 'active' | 'trial' | 'suspended' | 'archived'

/** Métadonnées commerciales — seules données qu'un super_admin_plateforme peut lire. */
export interface UniversityMeta {
  id: string
  name: string
  slug: string
  plan: UniversityPlan
  status: UniversityStatus
  ownerUid: string
  createdAt: number
  /** Quotas de comptes de connexion. Absents : valeurs par défaut du plan
   * (standard 500/50, premium 5000/500, enterprise illimité — voir
   * PLAN_DEFAULT_QUOTAS dans functions/src/auth/accountShared.ts). */
  maxStudents?: number
  maxTeachers?: number
}

/** Relation parent-enfant — un parent peut avoir plusieurs entrées. */
export interface ParentLink {
  studentId: string
  relation: 'father' | 'mother' | 'guardian'
  authorized: boolean
  grantedAt: number
  grantedBy: string
}

// ---------------------------------------------------------------------
// Phase 2 — module Étudiants
// ---------------------------------------------------------------------

export type EnrollmentStatus = 'enrolled' | 'pending' | 'graduated' | 'withdrawn'

/** Statut du dossier étudiant dans le registre — distinct du statut du
 * compte Firebase Auth (/users/{uid}), qui n'est jamais modifié par ce
 * module (voir FIREBASE_SECURITY.md : /users reste écriture Cloud Function
 * uniquement). */
export type StudentAccountStatus = 'active' | 'inactive'

export interface StudentProfile {
  id: string
  studentNumber: string
  firstName: string
  lastName: string
  email: string
  classId?: string
  programId?: string
  enrollmentStatus: EnrollmentStatus
  accountStatus: StudentAccountStatus
  /** uid Firebase Auth lié — posé uniquement par la Cloud Function
   * createUserAccount ; absent tant qu'aucun accès de connexion n'existe. */
  uid?: string
  /** Clé de recherche dénormalisée (minuscules) : nom + prénom + matricule. */
  searchKey: string
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------
// Phase 3 — Enseignants / Filières / Cours / Classes
// ---------------------------------------------------------------------

/** Statut du dossier enseignant — même principe que StudentAccountStatus :
 * distinct du compte Firebase Auth, jamais modifié par ce module. */
export type TeacherAccountStatus = 'active' | 'inactive'

export interface TeacherProfile {
  id: string
  employeeNumber: string
  firstName: string
  lastName: string
  email: string
  department?: string
  accountStatus: TeacherAccountStatus
  /** Voir StudentProfile.uid. */
  uid?: string
  searchKey: string
  createdAt: number
  updatedAt: number
}

export type ProgramStatus = 'active' | 'inactive'

export interface Program {
  id: string
  name: string
  code: string
  description?: string
  durationYears?: number
  status: ProgramStatus
  createdAt: number
  updatedAt: number
}

export interface CourseUnit {
  id: string
  name: string
  code: string
  programId: string
  teacherId?: string
  credits?: number
  createdAt: number
  updatedAt: number
}

export type ClassStatus = 'active' | 'inactive'

export interface ClassGroup {
  id: string
  name: string
  programId: string
  level?: string
  /** Libre pour l'instant : le module Années académiques n'existe pas
   * encore (Phase à venir). Simple référence textuelle en attendant. */
  academicYearLabel?: string
  status: ClassStatus
  createdAt: number
  updatedAt: number
}

// ---------------------------------------------------------------------
// Auto-inscription (demande d'accès validée par l'admin de l'université)
// ---------------------------------------------------------------------

export type SignupRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected'

/** signupStatus/{uid} : ce que le demandeur voit de SA demande. */
export interface SignupRequestState {
  universityId: string
  universityName: string
  requestedRole: 'student' | 'teacher'
  status: SignupRequestStatus
  createdAt: number
  decidedAt?: number
  /** Motif du refus, saisi par l'admin (facultatif). */
  reason?: string
}

/** universities/{u}/signupRequests/{uid} : la demande vue par l'admin. */
export interface SignupRequest {
  uid: string
  email: string
  emailVerified: boolean
  firstName: string
  lastName: string
  requestedRole: 'student' | 'teacher'
  status: SignupRequestStatus
  createdAt: number
  decidedAt?: number
  decidedBy?: string
  reason?: string
  linkedRecordId?: string
}
