import { useAuth } from '@/core/firebase/AuthContext'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import { AdminDashboard } from '@/modules/dashboard/AdminDashboard'
import { TeacherDashboard } from '@/modules/dashboard/TeacherDashboard'
import { StudentDashboard } from '@/modules/dashboard/StudentDashboard'
import { ParentDashboard } from '@/modules/dashboard/ParentDashboard'

/** Tableau de bord : une vue par rôle, chacune ne lisant que les données
 * que les règles ouvrent à ce rôle (le super admin a son propre espace,
 * /app/plateforme). */
export function DashboardPage() {
  const { appUser } = useAuth()
  useDocumentTitle('Tableau de bord')
  if (!appUser) return null

  switch (appUser.role) {
    case 'admin_universite':
      return <AdminDashboard />
    case 'teacher':
      return <TeacherDashboard />
    case 'student':
      return <StudentDashboard />
    case 'parent':
      return <ParentDashboard />
    default:
      return null
  }
}
