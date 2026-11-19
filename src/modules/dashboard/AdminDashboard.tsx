import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  Layers,
  PieChart,
  Plus,
  Rows3,
  UserMinus,
  UserPlus,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { ROLE_LABELS } from '@/shared/config/roleLabels'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { countLabel } from '@/shared/utils/plural'
import { CREATE_PARAM } from '@/shared/hooks/useCreateFromUrl'
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_STATUS_TONE } from '@/modules/students/schema'
import type {
  ClassGroup,
  CourseUnit,
  Program,
  SignupRequest,
  StudentProfile,
  TeacherProfile,
} from '@/core/types'
import { useTenantRows } from './useDashboardData'
import {
  attentionItems,
  byId,
  countByEnrollment,
  latestStudents,
  pendingSignupCount,
  type AttentionItem,
} from './stats'
import { formatShortDate, initials } from './format'
import {
  ComingSoonCard,
  DashboardHeader,
  Panel,
  PanelEmpty,
  PanelError,
  PanelSkeleton,
  StatCard,
  StatGrid,
  StatusDistribution,
} from './DashboardUI'

const ATTENTION_ICON: Record<AttentionItem['kind'], LucideIcon> = {
  'course-without-teacher': BookOpen,
  'inactive-teacher': UserMinus,
  'empty-class': Rows3,
}

/** Tableau de bord de l'admin d'université : lectures toutes ouvertes à ce
 * rôle par les règles (students, teachers, programs, courses, classes,
 * signupRequests de SON université). */
export function AdminDashboard() {
  const { appUser, university } = useAuth()
  const uid = appUser?.universityId ?? null

  const students = useTenantRows<StudentProfile>(uid, 'students')
  const teachers = useTenantRows<TeacherProfile>(uid, 'teachers')
  const programs = useTenantRows<Program>(uid, 'programs')
  const courses = useTenantRows<CourseUnit>(uid, 'courses')
  const classes = useTenantRows<ClassGroup>(uid, 'classes')
  const signups = useTenantRows<SignupRequest>(uid, 'signupRequests')

  const canCreateStudent = useCan('students', 'create')
  const canCreateTeacher = useCan('teachers', 'create')
  const canCreateCourse = useCan('courses', 'create')
  const canCreateClass = useCan('classes', 'create')

  const s = students.data
  const t = teachers.data
  const p = programs.data
  const c = courses.data
  const cl = classes.data
  const pending = signups.data ? pendingSignupCount(signups.data) : null

  const counts = useMemo(() => (s ? countByEnrollment(s) : null), [s])
  const attention = useMemo(
    () => (s && t && c && cl ? attentionItems(c, t, cl, s) : null),
    [s, t, c, cl]
  )
  const recent = useMemo(() => (s ? latestStudents(s, 5) : null), [s])
  const classById = useMemo(() => byId(cl ?? []), [cl])
  const programById = useMemo(() => byId(p ?? []), [p])

  if (!appUser) return null

  const activeTeachers = t?.filter((x) => x.accountStatus !== 'inactive').length ?? 0
  const activePrograms = p?.filter((x) => x.status === 'active').length ?? 0
  const activeClasses = cl?.filter((x) => x.status === 'active').length ?? 0
  const unassigned = c?.filter((x) => !x.teacherId).length ?? 0

  const quickActions = [
    canCreateStudent && { to: `/app/students?${CREATE_PARAM}=1`, label: 'Nouvel étudiant', icon: GraduationCap },
    canCreateTeacher && { to: `/app/teachers?${CREATE_PARAM}=1`, label: 'Nouvel enseignant', icon: Users },
    canCreateCourse && { to: `/app/courses?${CREATE_PARAM}=1`, label: 'Nouveau cours', icon: BookOpen },
    canCreateClass && { to: `/app/classes?${CREATE_PARAM}=1`, label: 'Nouvelle classe', icon: Rows3 },
  ].filter(Boolean) as { to: string; label: string; icon: LucideIcon }[]

  return (
    <div className="dash mx-auto w-full max-w-6xl" data-dashboard="admin">
      <DashboardHeader
        eyebrow={ROLE_LABELS[appUser.role]}
        firstName={appUser.name.split(' ')[0]}
        universityName={university?.name}
      />

      <StatGrid>
        <StatCard
          id="students"
          index={0}
          icon={GraduationCap}
          label="Étudiants"
          value={s?.length ?? null}
          hint={counts && countLabel(counts.enrolled, 'inscrit', 'inscrits')}
          to="/app/students"
        />
        <StatCard
          id="teachers"
          index={1}
          icon={Users}
          label="Enseignants"
          value={t?.length ?? null}
          hint={t && countLabel(activeTeachers, 'actif', 'actifs')}
          to="/app/teachers"
        />
        <StatCard
          id="programs"
          index={2}
          icon={Layers}
          label="Filières"
          value={p?.length ?? null}
          hint={p && countLabel(activePrograms, 'active', 'actives')}
          to="/app/programs"
        />
        <StatCard
          id="courses"
          index={3}
          icon={BookOpen}
          label="Cours"
          value={c?.length ?? null}
          hint={c && (unassigned ? countLabel(unassigned, 'sans enseignant', 'sans enseignant') : 'Tous attribués')}
          to="/app/courses"
        />
        <StatCard
          id="classes"
          index={4}
          icon={Rows3}
          label="Classes"
          value={cl?.length ?? null}
          hint={cl && countLabel(activeClasses, 'active', 'actives')}
          to="/app/classes"
        />
        <StatCard
          id="signups"
          index={5}
          icon={UserPlus}
          label="Demandes d'inscription"
          value={pending}
          hint={pending === null ? undefined : pending ? 'En attente de validation' : 'Aucune demande en attente'}
          to="/app/inscriptions"
          highlight={pending ? <StatusBadge tone="warning">À traiter</StatusBadge> : undefined}
        />
      </StatGrid>

      <div className="mt-4 grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel id="distribution" index={6} icon={PieChart} title="Étudiants par statut">
          {students.error ? (
            <PanelError what="les étudiants" />
          ) : !counts ? (
            <PanelSkeleton rows={4} />
          ) : s && s.length === 0 ? (
            <PanelEmpty icon={GraduationCap} title="Aucun étudiant enregistré">
              La répartition apparaîtra dès la première fiche créée.
            </PanelEmpty>
          ) : (
            <StatusDistribution counts={counts} />
          )}
        </Panel>

        <Panel
          id="attention"
          index={7}
          icon={AlertCircle}
          title="Points d'attention"
          aside={
            attention && attention.length > 0 ? (
              <StatusBadge tone="warning">{countLabel(attention.length, 'point', 'points')}</StatusBadge>
            ) : undefined
          }
        >
          {students.error || teachers.error || courses.error || classes.error ? (
            <PanelError what="les points d'attention" />
          ) : !attention ? (
            <PanelSkeleton rows={3} />
          ) : attention.length === 0 ? (
            <PanelEmpty icon={CheckCircle2} title="Rien à signaler">
              Chaque cours a un enseignant actif et chaque classe compte des étudiants.
            </PanelEmpty>
          ) : (
            <ul className="-mx-2 space-y-0.5" data-testid="attention-list">
              {attention.map((item) => {
                const Icon = ATTENTION_ICON[item.kind]
                return (
                  <li key={item.key} data-kind={item.kind}>
                    <Link
                      to={item.to}
                      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-base-200"
                    >
                      <span className="dash-icon-warning flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        <span className="block text-xs text-base-content/70">{item.detail}</span>
                      </span>
                      <ChevronRight
                        size={15}
                        aria-hidden="true"
                        className="shrink-0 text-base-content/40 group-hover:text-base-content/70"
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          id="latest-students"
          index={8}
          icon={UserPlus}
          title="Dernières inscriptions"
          className="md:col-span-2"
          footer={s && s.length > 0 ? { to: '/app/students', label: 'Voir tous les étudiants' } : undefined}
        >
          {students.error ? (
            <PanelError what="les étudiants" />
          ) : !recent ? (
            <PanelSkeleton rows={5} />
          ) : recent.length === 0 ? (
            <PanelEmpty icon={GraduationCap} title="Aucun étudiant pour l'instant">
              Les cinq dernières fiches créées s'afficheront ici.
            </PanelEmpty>
          ) : (
            <ul className="-mx-2 divide-y divide-base-300" data-testid="latest-students">
              {recent.map((st) => {
                const className = st.classId ? classById.get(st.classId)?.name : undefined
                const prog = st.programId ? programById.get(st.programId)?.code : undefined
                return (
                  <li key={st.id}>
                    <Link
                      to={`/app/students/${st.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-base-200"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-xs font-semibold text-base-content/80"
                        aria-hidden="true"
                      >
                        {initials(st.firstName, st.lastName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {st.firstName} {st.lastName}
                        </span>
                        <span className="block truncate text-xs text-base-content/70">
                          <span className="font-mono-data">{st.studentNumber}</span>
                          {className && ` · ${className}`}
                          {!className && prog && ` · ${prog}`}
                        </span>
                      </span>
                      <span className="hidden text-xs text-base-content/70 sm:block">
                        {st.createdAt ? formatShortDate(st.createdAt) : ''}
                      </span>
                      <StatusBadge tone={ENROLLMENT_STATUS_TONE[st.enrollmentStatus]}>
                        {ENROLLMENT_STATUS_LABELS[st.enrollmentStatus]}
                      </StatusBadge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {quickActions.length > 0 && (
          <Panel id="quick-actions" index={9} icon={Zap} title="Actions rapides">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-1">
              {quickActions.map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="group flex items-center gap-3 rounded-lg border border-base-300 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <a.icon size={16} aria-hidden="true" />
                  </span>
                  <span className="flex-1">{a.label}</span>
                  <Plus size={15} aria-hidden="true" className="text-base-content/50 group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </Panel>
        )}

        <ComingSoonCard
          index={10}
          items={[
            { icon: ClipboardCheck, label: 'Notes et examens', detail: 'Saisie par les enseignants, relevés par étudiant.' },
            { icon: CreditCard, label: 'Paiements', detail: 'Frais de scolarité et suivi des règlements.' },
            { icon: Video, label: 'E-learning', detail: 'Supports et activités en ligne par cours.' },
          ]}
        />
      </div>
    </div>
  )
}
