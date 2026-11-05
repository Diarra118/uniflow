import { Navigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { EmptyState } from '@/shared/components/States'
import { StudentProfilePage } from './StudentProfilePage'

/**
 * « Mon dossier » d'un étudiant. Les règles RTDB ne lui permettent de lire
 * que SA fiche (students/{id} où uid === auth.uid) : l'identifiant vient de
 * /users/{uid}.linkedRecordId, posé par createUserAccount.
 */
export function MyStudentRecordPage() {
  const { appUser } = useAuth()

  if (appUser?.role !== 'student') return <Navigate to="/app" replace />

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
