import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight, ClipboardCheck, Plus } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import type { CourseUnit, Exam } from '@/core/types'
import { ListPage } from '@/shared/components/ListPage'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { countLabel, listSubtitle } from '@/shared/utils/plural'
import { createExam } from './api'
import { ExamFormModal } from './ExamFormModal'
import { byExamDate, isExamToGrade, studentsToGrade } from './grading'
import { useAllExams, useExamsOfCourses, useGradesOfExams } from './hooks'
import { EXAM_TYPE_LABELS, formatExamDate, formatScore } from './schema'
import { useGradingScope } from './useGradingScope'

/**
 * Page « Notes » : l'enseignant voit SES cours et leurs examens, en crée et
 * ouvre la saisie ; l'admin voit tous les cours de son université, en
 * lecture, avec accès à la correction par examen.
 */
export function GradesPage() {
  const { appUser, university } = useAuth()
  const scope = useGradingScope()
  const canCreateExam = useCan('exams', 'create') && !scope.isAdmin
  const [creatingFor, setCreatingFor] = useState<CourseUnit | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const courseIds = useMemo(() => (scope.courses ? scope.courses.map((c) => c.id) : null), [scope.courses])
  const teacherExams = useExamsOfCourses(scope.isAdmin ? null : scope.universityId, scope.isAdmin ? null : courseIds)
  const adminExams = useAllExams(scope.isAdmin ? scope.universityId : null)
  const exams = scope.isAdmin ? adminExams.exams : teacherExams.exams
  const examIds = useMemo(() => (exams ? exams.map((e) => e.id) : null), [exams])
  const grades = useGradesOfExams(scope.universityId, examIds)

  const examsByCourse = useMemo(() => {
    const m = new Map<string, Exam[]>()
    for (const e of exams ?? []) m.set(e.courseId, [...(m.get(e.courseId) ?? []), e])
    for (const list of m.values()) list.sort(byExamDate)
    return m
  }, [exams])

  const loading = !scope.courses || !exams || !scope.students || !grades.gradesByExam
  const error = scope.error || teacherExams.error || adminExams.error || grades.error

  async function handleCreate(course: CourseUnit, values: Parameters<typeof createExam>[2]) {
    if (!scope.universityId || !appUser) return
    await createExam(scope.universityId, course.id, values, appUser.uid)
    setNotice(`Examen « ${values.title.trim()} » créé pour ${course.code}.`)
  }

  const subtitle = scope.courses
    ? listSubtitle(countLabel(scope.courses.length, 'cours', 'cours'), university?.name)
    : undefined

  return (
    <ListPage title="Notes" subtitle={subtitle}>
      {notice && (
        <div role="status" className="alert alert-success mb-4 text-sm">
          <span>{notice}</span>
        </div>
      )}

      {error ? (
        <ErrorState description="Impossible de charger les cours et les examens." />
      ) : loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : scope.courses!.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Aucun cours"
          description={
            scope.isAdmin
              ? 'Les cours de votre université apparaîtront ici dès leur création.'
              : "Aucun cours ne vous est attribué. Contactez l'administration de votre université."
          }
        />
      ) : (
        <div className="space-y-4" data-testid="grades-courses">
          {scope.courses!.map((course) => {
            const courseExams = examsByCourse.get(course.id) ?? []
            const expected = studentsToGrade(scope.students!, course)
            const program = course.programId ? scope.programById.get(course.programId) : undefined
            return (
              <section
                key={course.id}
                data-course={course.code}
                className="rounded-box border border-base-300 bg-base-100"
                aria-labelledby={`course-${course.id}`}
              >
                <header className="flex flex-col gap-3 border-b border-base-300 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 id={`course-${course.id}`} className="flex items-baseline gap-2 text-[15px] font-semibold">
                      <span className="font-mono-data text-xs font-medium text-base-content/75">{course.code}</span>
                      <span className="truncate">{course.name}</span>
                    </h2>
                    <p className="text-xs text-base-content/70">
                      {program?.name ?? 'Filière non renseignée'} · {countLabel(expected.length, 'étudiant', 'étudiants')} à noter
                    </p>
                  </div>
                  {canCreateExam && (
                    <button type="button" className="btn btn-outline btn-sm gap-2" onClick={() => { setNotice(null); setCreatingFor(course) }}>
                      <Plus size={15} />
                      Nouvel examen
                    </button>
                  )}
                </header>

                {courseExams.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-base-content/70">Aucun examen pour ce cours.</p>
                ) : (
                  <ul className="divide-y divide-base-300">
                    {courseExams.map((exam) => {
                      const examGrades = grades.gradesByExam!.get(exam.id) ?? []
                      const graded = new Set(examGrades.map((g) => g.studentId))
                      const done = expected.filter((s) => graded.has(s.id)).length
                      const toGrade = isExamToGrade(graded, expected)
                      return (
                        <li key={exam.id}>
                          <Link
                            to={`/app/notes/${exam.id}`}
                            data-exam={exam.title}
                            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-base-200"
                          >
                            <ClipboardCheck size={17} aria-hidden="true" className="shrink-0 text-base-content/60" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{exam.title}</span>
                              <span className="block text-xs text-base-content/70">
                                {EXAM_TYPE_LABELS[exam.type]} · {formatExamDate(exam.date)} · coef. {formatScore(exam.coefficient)} · sur {formatScore(exam.maxScore)}
                              </span>
                            </span>
                            <span className="hidden text-xs text-base-content/70 sm:block">
                              {done} / {expected.length} notés
                            </span>
                            {toGrade ? (
                              <StatusBadge tone="warning">À noter</StatusBadge>
                            ) : (
                              <StatusBadge tone="success">Noté</StatusBadge>
                            )}
                            <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-base-content/40" />
                          </Link>
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

      {creatingFor && (
        <ExamFormModal
          key={creatingFor.id}
          course={creatingFor}
          onClose={() => setCreatingFor(null)}
          onSubmit={(values) => handleCreate(creatingFor, values)}
        />
      )}
    </ListPage>
  )
}
