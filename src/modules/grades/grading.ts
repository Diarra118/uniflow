import type { CourseUnit, Exam, Grade, StudentProfile } from '@/core/types'

/** Identifiant d'une note : une seule par examen et par fiche (imposé par
 * les règles : $gradeId === examId + '_' + studentId). */
export const gradeId = (examId: string, studentId: string) => `${examId}_${studentId}`

/** Tri des examens : date croissante, puis titre. */
export const byExamDate = (a: Exam, b: Exam) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)

/**
 * Étudiants à noter pour un cours : fiches de la filière du cours, inscrites
 * ou en attente (les retirés et diplômés ne sont pas notés). Les règles
 * n'autorisent l'enseignant à noter que les étudiants de la filière du cours.
 */
export function studentsToGrade(students: StudentProfile[], course: Pick<CourseUnit, 'programId'> | undefined) {
  if (!course?.programId) return []
  return students
    .filter((s) => s.programId === course.programId && (s.enrollmentStatus === 'enrolled' || s.enrollmentStatus === 'pending'))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
}

/**
 * Moyenne pondérée d'un cours, calculée à l'affichage et ramenée sur 20 :
 * chaque note est d'abord ramenée sur 20 (valeur / note maximale × 20),
 * puis pondérée par le coefficient de son examen. Seuls les examens notés
 * comptent. null si aucune note.
 */
export function weightedAverage(exams: Exam[], gradeOf: (examId: string) => Grade | undefined): number | null {
  let sum = 0
  let weights = 0
  for (const e of exams) {
    const g = gradeOf(e.id)
    if (!g || !(e.maxScore > 0) || !(e.coefficient > 0)) continue
    sum += (g.value / e.maxScore) * 20 * e.coefficient
    weights += e.coefficient
  }
  return weights > 0 ? sum / weights : null
}

/** Moyenne simple d'un examen, sur sa note maximale. null si aucune note. */
export function examAverage(grades: Grade[]): number | null {
  return grades.length ? grades.reduce((s, g) => s + g.value, 0) / grades.length : null
}

/** Un examen « à noter » : au moins un étudiant à noter n'a pas encore de note. */
export function isExamToGrade(gradedStudentIds: Set<string>, expected: StudentProfile[]) {
  return expected.some((s) => !gradedStudentIds.has(s.id))
}
