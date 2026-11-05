import { NavLink } from 'react-router-dom'
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  Layers,
  BookOpen,
  Rows3,
  ClipboardCheck,
  CreditCard,
  Video,
  Building2,
} from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { ROLE_LABELS } from '@/shared/config/roleLabels'

// Aperçu visuel de la feuille de route — aucun lien, aucune donnée : ces
// modules seront implémentés phase par phase (voir architecture §10).
const UPCOMING_MODULES = [
  { label: 'Notes & examens', icon: ClipboardCheck },
  { label: 'Paiements', icon: CreditCard },
  { label: 'E-learning', icon: Video },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { appUser, university } = useAuth()

  const isPlatformAdmin = appUser?.role === 'super_admin_plateforme'
  const canReadOwnRecord = useCan('ownStudentRecord', 'read')
  const canReadStudents = useCan('students', 'read')
  const canReadTeachers = useCan('teachers', 'read')
  const canReadPrograms = useCan('programs', 'read')
  const canReadCourses = useCan('courses', 'read')
  const canReadClasses = useCan('classes', 'read')

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
      isActive
        ? 'nav-ruled-active bg-primary/10 text-primary'
        : 'text-base-content/70 hover:bg-base-200 hover:text-base-content'
    }`

  return (
    <div className="flex h-full flex-col bg-base-100">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-content">
          <GraduationCap size={20} strokeWidth={2.25} />
        </div>
        <div className="min-w-0">
          <p className="font-display truncate text-[15px] font-semibold leading-tight">
            {university?.name ?? 'UniversityFlow AI'}
          </p>
          <p className="truncate text-xs text-base-content/50">
            {appUser ? ROLE_LABELS[appUser.role] : 'Plateforme académique'}
          </p>
        </div>
      </div>

      <nav className="space-y-0.5 px-3">
        {isPlatformAdmin ? (
          <NavLink to="/app/plateforme" onClick={onNavigate} className={linkClass}>
            <Building2 size={17} strokeWidth={2} />
            Espace plateforme
          </NavLink>
        ) : (
          <>
            <NavLink to="/app" end onClick={onNavigate} className={linkClass}>
              <LayoutDashboard size={17} strokeWidth={2} />
              Tableau de bord
            </NavLink>
            {canReadOwnRecord && (
              <NavLink to="/app/mon-dossier" onClick={onNavigate} className={linkClass}>
                <GraduationCap size={17} strokeWidth={2} />
                Mon dossier
              </NavLink>
            )}
            {canReadStudents && (
              <NavLink to="/app/students" onClick={onNavigate} className={linkClass}>
                <GraduationCap size={17} strokeWidth={2} />
                Étudiants
              </NavLink>
            )}
            {canReadTeachers && (
              <NavLink to="/app/teachers" onClick={onNavigate} className={linkClass}>
                <Users size={17} strokeWidth={2} />
                Enseignants
              </NavLink>
            )}
            {canReadPrograms && (
              <NavLink to="/app/programs" onClick={onNavigate} className={linkClass}>
                <Layers size={17} strokeWidth={2} />
                Filières
              </NavLink>
            )}
            {canReadCourses && (
              <NavLink to="/app/courses" onClick={onNavigate} className={linkClass}>
                <BookOpen size={17} strokeWidth={2} />
                Cours
              </NavLink>
            )}
            {canReadClasses && (
              <NavLink to="/app/classes" onClick={onNavigate} className={linkClass}>
                <Rows3 size={17} strokeWidth={2} />
                Classes
              </NavLink>
            )}
          </>
        )}
      </nav>

      {!isPlatformAdmin && (
        <div className="mt-6 flex-1 overflow-y-auto px-3">
          <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wide text-base-content/35">
            Modules à venir
          </p>
          <div className="space-y-0.5">
            {UPCOMING_MODULES.map((m) => (
              <div
                key={m.label}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-base-content/35"
              >
                <m.icon size={16} strokeWidth={2} />
                <span className="truncate">{m.label}</span>
                <span className="badge badge-ghost badge-xs ml-auto">bientôt</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
