import type {
  ClassGroup,
  CourseUnit,
  EnrollmentStatus,
  Program,
  SignupRequest,
  StudentProfile,
  TeacherProfile,
} from '@/core/types'

/** Ordre d'affichage des statuts d'inscription (répartition, légende). */
export const ENROLLMENT_ORDER: EnrollmentStatus[] = ['enrolled', 'pending', 'withdrawn', 'graduated']

export function countByEnrollment(students: StudentProfile[]): Record<EnrollmentStatus, number> {
  const counts: Record<EnrollmentStatus, number> = { enrolled: 0, pending: 0, withdrawn: 0, graduated: 0 }
  for (const s of students) if (s.enrollmentStatus in counts) counts[s.enrollmentStatus]++
  return counts
}

export const pendingSignupCount = (requests: SignupRequest[]) =>
  requests.filter((r) => r.status === 'pending').length

export const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`
const courseLabel = (c: CourseUnit) => `${c.name} (${c.code})`

/** Point d'attention : une anomalie de données, avec l'écran qui la corrige. */
export interface AttentionItem {
  kind: 'course-without-teacher' | 'inactive-teacher' | 'empty-class'
  key: string
  title: string
  detail: string
  to: string
}

/**
 * Anomalies à corriger :
 * - cours sans enseignant (aucun, ou fiche enseignant supprimée) ;
 * - enseignant inactif encore responsable d'au moins un cours ;
 * - classe active sans aucun étudiant rattaché.
 */
export function attentionItems(
  courses: CourseUnit[],
  teachers: TeacherProfile[],
  classes: ClassGroup[],
  students: StudentProfile[]
): AttentionItem[] {
  const teacherById = byId(teachers)
  const items: AttentionItem[] = []

  for (const c of courses) {
    if (!c.teacherId || !teacherById.has(c.teacherId)) {
      items.push({
        kind: 'course-without-teacher',
        key: `course-${c.id}`,
        title: courseLabel(c),
        detail: c.teacherId ? 'Enseignant introuvable : fiche supprimée' : 'Aucun enseignant attribué',
        to: '/app/courses',
      })
    }
  }

  for (const t of teachers) {
    if (t.accountStatus !== 'inactive') continue
    const linked = courses.filter((c) => c.teacherId === t.id)
    if (linked.length === 0) continue
    items.push({
      kind: 'inactive-teacher',
      key: `teacher-${t.id}`,
      title: fullName(t),
      detail: `Fiche inactive, encore responsable de ${linked.map((c) => c.code).join(', ')}`,
      to: `/app/teachers/${t.id}`,
    })
  }

  const classesWithStudents = new Set(students.map((s) => s.classId).filter(Boolean))
  for (const cl of classes) {
    if (cl.status !== 'active' || classesWithStudents.has(cl.id)) continue
    items.push({
      kind: 'empty-class',
      key: `class-${cl.id}`,
      title: cl.name,
      detail: 'Classe active sans aucun étudiant',
      to: '/app/classes',
    })
  }

  return items
}

/** Les `n` fiches étudiants les plus récentes (date de création). */
export function latestStudents(students: StudentProfile[], n = 5): StudentProfile[] {
  return [...students].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, n)
}

/** Cours d'un enseignant (par l'id de SA fiche), triés par code. */
export function coursesOfTeacher(courses: CourseUnit[], teacherId: string | null): CourseUnit[] {
  if (!teacherId) return []
  return courses.filter((c) => c.teacherId === teacherId).sort((a, b) => a.code.localeCompare(b.code))
}

export const totalCredits = (courses: CourseUnit[]) =>
  courses.reduce((sum, c) => sum + (Number.isFinite(c.credits) ? (c.credits as number) : 0), 0)

export const programName = (programs: Map<string, Program>, id?: string) =>
  (id && programs.get(id)?.name) || null
