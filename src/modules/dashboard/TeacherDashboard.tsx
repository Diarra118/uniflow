import { useMemo } from 'react'
import { BookOpen, ClipboardCheck, Bell, Layers, Award, Video } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { ROLE_LABELS } from '@/shared/config/roleLabels'
import { countLabel } from '@/shared/utils/plural'
import type { CourseUnit, Program, StudentProfile, TeacherProfile } from '@/core/types'
import { useExamsOfCourses, useGradesOfExams } from '@/modules/grades/hooks'
import { isExamToGrade, studentsToGrade } from '@/modules/grades/grading'
import { useTenantRows } from './useDashboardData'
import { byId, coursesOfTeacher, totalCredits } from './stats'
import {
  ComingSoonCard,
  DashboardHeader,
  Panel,
  PanelEmpty,
  PanelError,
  PanelSkeleton,
  StatCard,
  StatGrid,
} from './DashboardUI'

/** Tableau de bord enseignant : SES cours (courses.teacherId = id de sa
 * fiche). Lectures ouvertes à ce rôle : courses, programs, et teachers
 * seulement si la fiche liée n'est pas connue du profil. */
export function TeacherDashboard() {
  const { appUser, university } = useAuth()
  const uid = appUser?.universityId ?? null
  const linkedId = appUser?.linkedRecordType === 'teacher' ? (appUser.linkedRecordId ?? null) : null

  const courses = useTenantRows<CourseUnit>(uid, 'courses')
  const programs = useTenantRows<Program>(uid, 'programs')
  // Comptes créés avant le lien de fiche : on retrouve la fiche par son uid.
  const teachers = useTenantRows<TeacherProfile>(linkedId ? null : uid, 'teachers')

  const teacherId = linkedId ?? teachers.data?.find((t) => t.uid === appUser?.uid)?.id ?? null
  const recordResolved = linkedId !== null || teachers.data !== null
  const mine = useMemo(
    () => (courses.data && recordResolved ? coursesOfTeacher(courses.data, teacherId) : null),
    [courses.data, recordResolved, teacherId]
  )
  const programById = useMemo(() => byId(programs.data ?? []), [programs.data])

  // Examens à noter : examens de ses cours où au moins un étudiant de la
  // filière n'a pas encore de note (lectures par requête, règles v1.4).
  const students = useTenantRows<StudentProfile>(uid, 'students')
  const mineIds = useMemo(() => (mine ? mine.map((c) => c.id) : null), [mine])
  const exams = useExamsOfCourses(uid, mineIds)
  const examIds = useMemo(() => (exams.exams ? exams.exams.map((e) => e.id) : null), [exams.exams])
  const grades = useGradesOfExams(uid, examIds)
  const toGrade = useMemo(() => {
    if (!mine || !exams.exams || !grades.gradesByExam || !students.data) return null
    const courseById = byId(mine)
    return exams.exams.filter((e) => {
      const graded = new Set((grades.gradesByExam!.get(e.id) ?? []).map((g) => g.studentId))
      return isExamToGrade(graded, studentsToGrade(students.data!, courseById.get(e.courseId)))
    }).length
  }, [mine, exams.exams, grades.gradesByExam, students.data])

  if (!appUser) return null

  const programCount = mine ? new Set(mine.map((c) => c.programId).filter(Boolean)).size : null
  const credits = mine ? totalCredits(mine) : null
  const programNames = mine
    ? [...new Set(mine.map((c) => (c.programId && programById.get(c.programId)?.name) || null).filter(Boolean))].join(', ')
    : null
  const loadError = courses.error || programs.error || teachers.error

  return (
    <div className="dash mx-auto w-full max-w-6xl" data-dashboard="teacher">
      <DashboardHeader
        eyebrow={ROLE_LABELS[appUser.role]}
        firstName={appUser.name.split(' ')[0]}
        universityName={university?.name}
      />

      <StatGrid>
        <StatCard id="my-courses" index={0} icon={BookOpen} label="Mes cours" value={mine?.length ?? null} hint={mine && 'Dont vous êtes responsable'} to="/app/courses" />
        <StatCard
          id="my-credits"
          index={1}
          icon={Award}
          label="Crédits enseignés"
          value={credits}
          hint={mine && (mine.length ? 'Somme des crédits de vos cours' : undefined)}
        />
        <StatCard
          id="my-programs"
          index={2}
          icon={Layers}
          label="Filières concernées"
          value={programCount}
          hint={mine && programNames}
          to="/app/programs"
        />
        <StatCard
          id="exams-to-grade"
          index={3}
          icon={ClipboardCheck}
          label="Examens à noter"
          value={exams.error || grades.error || students.error ? 0 : toGrade}
          hint={toGrade === null ? undefined : toGrade ? 'Notes incomplètes' : 'Toutes les notes sont saisies'}
          to="/app/notes"
        />
      </StatGrid>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          id="my-courses-list"
          index={4}
          icon={BookOpen}
          title="Mes cours"
          className="md:col-span-2"
          aside={
            mine ? (
              <span className="text-sm text-base-content/70" data-testid="my-courses-total">
                {countLabel(mine.length, 'cours', 'cours')} au total
              </span>
            ) : undefined
          }
          footer={{ to: '/app/courses', label: 'Voir tous les cours' }}
        >
          {loadError ? (
            <PanelError what="vos cours" />
          ) : !mine ? (
            <PanelSkeleton rows={3} />
          ) : !teacherId ? (
            <PanelEmpty icon={BookOpen} title="Aucune fiche enseignant liée">
              Votre compte n'est rattaché à aucune fiche enseignant. Contactez l'administration de votre université.
            </PanelEmpty>
          ) : mine.length === 0 ? (
            <PanelEmpty icon={BookOpen} title="Aucun cours attribué">
              Les cours dont vous êtes responsable apparaîtront ici dès leur attribution.
            </PanelEmpty>
          ) : (
            <ul className="-mx-2 divide-y divide-base-300" data-testid="my-courses">
              {mine.map((c) => {
                const program = c.programId ? programById.get(c.programId) : undefined
                return (
                  <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                    <span className="font-mono-data w-16 shrink-0 text-xs font-medium text-base-content/75">{c.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block truncate text-xs text-base-content/70">
                        {program?.name ?? 'Filière non renseignée'}
                      </span>
                    </span>
                    <span className="dash-number shrink-0 text-sm text-base-content/75">
                      {typeof c.credits === 'number' ? countLabel(c.credits, 'crédit', 'crédits') : '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <ComingSoonCard
          index={5}
          items={[
            { icon: Video, label: 'E-learning', detail: 'Supports et activités en ligne pour vos étudiants.' },
            { icon: Bell, label: 'Notifications', detail: "Messages de l'administration et rappels." },
          ]}
        />
      </div>
    </div>
  )
}
