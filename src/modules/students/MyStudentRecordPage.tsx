import { Navigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState } from '@/shared/components/States'
import { StudentProfilePage } from './StudentProfilePage'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'

/**
 * « Mon dossier » d'un étudiant (permission `ownStudentRecord`). Les règles
 * RTDB ne lui permettent de lire que SA fiche (students/{id} où
 * uid === auth.uid) : l'identifiant vient de /users/{uid}.linkedRecordId,
 * posé par createUserAccount.
 */
export function MyStudentRecordPage() {
  const { appUser } = useAuth()
  const canReadOwnRecord = useCan('ownStudentRecord', 'read')
  useDocumentTitle('Mon dossier')

  // Défense en profondeur : la route est déjà gardée par ProtectedRoute.
  if (!appUser || !canReadOwnRecord) return <Navigate to="/app" replace />

  if (!appUser.linkedRecordId || appUser.linkedRecordType !== 'student') {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Aucune fiche liée"
        description="Votre compte n'est rattaché à aucune fiche étudiant. Contactez l'administration de votre université."
      />
    )
  }

  return <StudentProfilePage studentId={appUser.linkedRecordId} />
}
