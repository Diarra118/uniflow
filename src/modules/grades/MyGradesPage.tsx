import { useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { BookOpen, GraduationCap } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { tenantDocPath } from '@/core/firebase/paths'
import type { CourseUnit, Exam, StudentProfile } from '@/core/types'
import { useNode, useTenantRows } from '@/modules/dashboard/useDashboardData'
import { ListPage } from '@/shared/components/ListPage'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { byExamDate, weightedAverage } from './grading'
import { useExamsOfCourses, useGradesOfStudent } from './hooks'
import { EXAM_TYPE_LABELS, formatExamDate, formatScore } from './schema'

/**
 * « Mes notes » : les cours de la filière de SA fiche, leurs examens, sa
 * note sur la note maximale, et la moyenne pondérée de chaque cours
 * (calculée ici, à l'affichage, jamais stockée). Lectures : sa fiche
 * (students/{linkedRecordId}), les examens de ses cours et SES notes,
 * par requête (règles).
 */
export function MyGradesPage() {
  const { appUser } = useAuth()
  const canReadOwn = useCan('ownStudentRecord', 'read')
  const uid = appUser?.universityId ?? null
  const recordId = appUser?.linkedRecordType === 'student' ? (appUser.linkedRecordId ?? null) : null

  const record = useNode<Omit<StudentProfile, 'id'>>(uid && recordId ? tenantDocPath(uid, 'students', recordId) : null)
  const courses = useTenantRows<CourseUnit>(uid && recordId ? uid : null, 'courses')
  const myCourses = useMemo(
    () =>
      record.data && courses.data
        ? courses.data.filter((c) => record.data!.programId && c.programId === record.data!.programId).sort((a, b) => a.code.localeCompare(b.code))
        : null,
    [record.data, courses.data]
  )
  const courseIds = useMemo(() => (myCourses ? myCourses.map((c) => c.id) : null), [myCourses])
  const exams = useExamsOfCourses(uid, courseIds)
  const grades = useGradesOfStudent(uid, recordId)

  const gradeByExam = useMemo(() => new Map((grades.grades ?? []).map((g) => [g.examId, g])), [grades.grades])
  const examsByCourse = useMemo(() => {
    const m = new Map<string, Exam[]>()
    for (const e of exams.exams ?? []) m.set(e.courseId, [...(m.get(e.courseId) ?? []), e])
    for (const list of m.values()) list.sort(byExamDate)
    return m
  }, [exams.exams])

  if (!appUser || !canReadOwn) return <Navigate to="/app" replace />

  if (!recordId) {
    return (
      <ListPage title="Mes notes">
        <EmptyState
          icon={GraduationCap}
          title="Aucune fiche liée"
          description="Votre compte n'est rattaché à aucune fiche étudiant. Contactez l'administration de votre université."
        />
      </ListPage>
    )
  }

  const error = record.error || courses.error || exams.error || grades.error
  const loading = !myCourses || !exams.exams || !grades.grades
  const gradedCount = grades.grades?.length ?? 0

  return (
    <ListPage title="Mes notes" subtitle={grades.grades ? `${gradedCount} ${gradedCount > 1 ? 'notes' : 'note'} — moyennes pondérées sur 20` : undefined}>
      {error ? (
        <ErrorState description="Impossible de charger vos notes." />
      ) : loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : myCourses!.length === 0 ? (
        <EmptyState icon={BookOpen} title="Aucun cours" description="Aucun cours n'est encore rattaché à votre filière." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="my-grades">
          {myCourses!.map((course) => {
            const list = examsByCourse.get(course.id) ?? []
            const average = weightedAverage(list, (id) => gradeByExam.get(id))
            return (
              <section
                key={course.id}
                data-course={course.code}
                className="rounded-box border border-base-300 bg-base-100"
                aria-labelledby={`my-course-${course.id}`}
              >
                <header className="flex items-start justify-between gap-3 border-b border-base-300 px-4 py-3">
                  <h2 id={`my-course-${course.id}`} className="min-w-0 text-[15px] font-semibold">
                    <span className="font-mono-data mr-2 text-xs font-medium text-base-content/75">{course.code}</span>
                    {course.name}
                  </h2>
                  <p className="shrink-0 text-right" data-average>
                    <span className="block text-xs text-base-content/70">Moyenne</span>
                    <span className="font-display text-lg font-semibold">
                      {average === null ? '—' : `${formatScore(average)} / 20`}
                    </span>
                  </p>
                </header>
                {list.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-base-content/70">Aucun examen pour ce cours.</p>
                ) : (
                  <ul className="divide-y divide-base-300">
                    {list.map((e) => {
                      const g = gradeByExam.get(e.id)
                      return (
                        <li key={e.id} data-exam={e.title} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{e.title}</span>
                            <span className="block text-xs text-base-content/70">
                              {EXAM_TYPE_LABELS[e.type]} · {formatExamDate(e.date)} · coef. {formatScore(e.coefficient)}
                            </span>
                            {g?.comment && <span className="mt-0.5 block text-xs italic text-base-content/75">« {g.comment} »</span>}
                          </span>
                          <span className="dash-number shrink-0 text-right text-sm" data-score>
                            {g ? (
                              <>
                                <span className="font-semibold">{formatScore(g.value)}</span>
                                <span className="text-base-content/70"> / {formatScore(e.maxScore)}</span>
                              </>
                            ) : (
                              <span className="text-base-content/70">Non noté</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </ListPage>
  )
}
