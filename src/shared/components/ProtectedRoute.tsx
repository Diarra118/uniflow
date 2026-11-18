import { Navigate } from 'react-router-dom'
import { useAuth } from '@/core/firebase/AuthContext'
import { can, type Action, type Resource } from '@/core/rbac/permissions'
import { FullPageLoader, ErrorState } from './States'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import { SignupPendingScreen } from '@/modules/signup/SignupPendingScreen'

/** Écran d'erreur qui donne aussi son titre à l'onglet. */
function TitledErrorState(props: React.ComponentProps<typeof ErrorState> & { title: string }) {
  useDocumentTitle(props.title)
  return <ErrorState {...props} />
}

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredPermission?: { resource: Resource; action: Action }
}

export function ProtectedRoute({ children, requiredPermission }: ProtectedRouteProps) {
  const { firebaseUser, appUser, loading, error, refreshClaims, signupRequest } = useAuth()

  if (loading) return <FullPageLoader />

  if (!firebaseUser) return <Navigate to="/login" replace />

  // Compte auto-inscrit sans rôle : état de sa demande, aucune donnée.
  if (!appUser && signupRequest) return <SignupPendingScreen request={signupRequest} />

  if (error || !appUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-base-200 p-6">
        <TitledErrorState
          title="Accès impossible"
          description={error ?? 'Profil utilisateur introuvable.'}
          onRetry={() => refreshClaims()}
        />
      </div>
    )
  }

  // super_admin_plateforme n'a pas de universityId : c'est attendu, pas une erreur.
  if (appUser.role !== 'super_admin_plateforme' && !appUser.universityId) {
    return (
      <div className="flex h-screen items-center justify-center bg-base-200 p-6">
        <TitledErrorState
          title="Compte non rattaché"
          description="Ce compte n'est rattaché à aucune université. Contactez votre administrateur."
        />
      </div>
    )
  }

  if (
    requiredPermission &&
    !can(appUser.role, requiredPermission.resource, requiredPermission.action)
  ) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <TitledErrorState
          title="Accès refusé"
          description="Vous n'avez pas la permission d'accéder à cette section."
        />
      </div>
    )
  }

  return <>{children}</>
}
