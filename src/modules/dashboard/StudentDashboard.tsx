import { useMemo, type ReactNode } from 'react'
import { BookOpen, ClipboardCheck, CreditCard, FileText, GraduationCap, IdCard } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { ROLE_LABELS } from '@/shared/config/roleLabels'
import { tenantDocPath } from '@/core/firebase/paths'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { countLabel } from '@/shared/utils/plural'
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_STATUS_TONE } from '@/modules/students/schema'
import type { ClassGroup, CourseUnit, Program, StudentProfile } from '@/core/types'
import { useNode, useTenantRows } from './useDashboardData'
import { byId, totalCredits } from './stats'
import {
  ComingSoonCard,
  DashboardHeader,
  Panel,
  PanelEmpty,
  PanelError,
  PanelSkeleton,
} from './DashboardUI'

function RecordRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-base-content/70">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  )
}

/** Tableau de bord étudiant : SA fiche (students/{linkedRecordId}, seule
 * fiche que les règles lui ouvrent), libellés de filière et de classe, et
 * les cours de sa filière (programs, classes, courses : lecture ouverte). */
export function StudentDashboard() {
  const { appUser, university } = useAuth()
  const uid = appUser?.universityId ?? null
  const recordId = appUser?.linkedRecordType === 'student' ? (appUser.linkedRecordId ?? null) : null

  const record = useNode<Omit<StudentProfile, 'id'>>(
    uid && recordId ? tenantDocPath(uid, 'students', recordId) : null
  )
  const hasRecord = Boolean(uid && recordId)
  const programs = useTenantRows<Program>(hasRecord ? uid : null, 'programs')
  const classes = useTenantRows<ClassGroup>(hasRecord ? uid : null, 'classes')
  const courses = useTenantRows<CourseUnit>(hasRecord ? uid : null, 'courses')

  const programById = useMemo(() => byId(programs.data ?? []), [programs.data])
  const classById = useMemo(() => byId(classes.data ?? []), [classes.data])
  const me = record.data
  const myCourses = useMemo(
    () =>
      me && courses.data
        ? courses.data.filter((c) => me.programId && c.programId === me.programId).sort((a, b) => a.code.localeCompare(b.code))
        : null,
    [me, courses.data]
  )

  if (!appUser) return null

  const program = me?.programId ? programById.get(me.programId) : undefined
  const cls = me?.classId ? classById.get(me.classId) : undefined
  const recordLoading = hasRecord && !record.error && (record.data === null || programs.data === null || classes.data === null)

  return (
    <div className="dash mx-auto w-full max-w-6xl" data-dashboard="student">
      <DashboardHeader
        eyebrow={ROLE_LABELS[appUser.role]}
        firstName={appUser.name.split(' ')[0]}
        universityName={university?.name}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          id="my-record"
          index={0}
          icon={IdCard}
          title="Ma fiche"
          footer={hasRecord ? { to: '/app/mon-dossier', label: 'Ouvrir mon dossier' } : undefined}
        >
          {!hasRecord ? (
            <PanelEmpty icon={GraduationCap} title="Aucune fiche liée">
              Votre compte n'est rattaché à aucune fiche étudiant. Contactez l'administration de votre université.
            </PanelEmpty>
          ) : record.error ? (
            <PanelError what="votre fiche" />
          ) : recordLoading || !me ? (
            <PanelSkeleton rows={4} />
          ) : (
            <dl className="divide-y divide-base-300 text-sm" data-testid="my-record">
              <RecordRow label="Matricule">
                <span className="font-mono-data">{me.studentNumber}</span>
              </RecordRow>
              <RecordRow label="Filière">{program?.name ?? 'Non renseignée'}</RecordRow>
              <RecordRow label="Classe">{cls?.name ?? 'Non renseignée'}</RecordRow>
              <RecordRow label="Statut">
                <StatusBadge tone={ENROLLMENT_STATUS_TONE[me.enrollmentStatus]}>
                  {ENROLLMENT_STATUS_LABELS[me.enrollmentStatus]}
                </StatusBadge>
              </RecordRow>
            </dl>
          )}
        </Panel>

        <Panel
          id="program-courses"
          index={1}
          icon={BookOpen}
          title="Cours de ma filière"
          aside={
            myCourses && myCourses.length > 0 ? (
              <span className="text-sm text-base-content/70">
                {countLabel(totalCredits(myCourses), 'crédit', 'crédits')}
              </span>
            ) : undefined
          }
          footer={hasRecord ? { to: '/app/courses', label: 'Voir tous les cours' } : undefined}
        >
          {!hasRecord ? (
            <PanelEmpty icon={BookOpen} title="Aucun cours à afficher">
              Les cours de votre filière s'afficheront une fois votre fiche rattachée.
            </PanelEmpty>
          ) : courses.error || record.error ? (
            <PanelError what="les cours" />
          ) : !myCourses ? (
            <PanelSkeleton rows={3} />
          ) : myCourses.length === 0 ? (
            <PanelEmpty icon={BookOpen} title="Aucun cours pour l'instant">
              Aucun cours n'est encore rattaché à votre filière.
            </PanelEmpty>
          ) : (
            <ul className="-mx-2 divide-y divide-base-300" data-testid="program-courses">
              {myCourses.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="font-mono-data w-16 shrink-0 text-xs font-medium text-base-content/75">{c.code}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{c.name}</span>
                  <span className="dash-number shrink-0 text-sm text-base-content/75">
                    {typeof c.credits === 'number' ? countLabel(c.credits, 'crédit', 'crédits') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <ComingSoonCard
          index={2}
          items={[
            { icon: ClipboardCheck, label: 'Notes et examens', detail: "Vos résultats et votre calendrier d'épreuves." },
            { icon: CreditCard, label: 'Paiements', detail: 'Frais de scolarité et reçus.' },
            { icon: FileText, label: 'Documents', detail: 'Attestations et relevés à télécharger.' },
          ]}
        />
      </div>
    </div>
  )
}
