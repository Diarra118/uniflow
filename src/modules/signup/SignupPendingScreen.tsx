import { Clock, LogOut, XCircle } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import type { SignupRequestState } from '@/core/types'
import { BrandMark } from '@/shared/components/BrandMark'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import { SIGNUP_ROLE_LABELS } from './schema'

/**
 * Écran d'un compte auto-inscrit sans rôle : aucune donnée de l'application,
 * seulement l'état de SA demande et un bouton de déconnexion.
 */
export function SignupPendingScreen({ request }: { request: SignupRequestState }) {
  const { signOut } = useAuth()
  const rejected = request.status === 'rejected'
  const approved = request.status === 'approved'
  useDocumentTitle(rejected ? 'Demande refusée' : 'Demande en attente')

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-6">
      <div className="w-full max-w-md rounded-box border border-base-300 bg-base-100 p-8">
        <BrandMark className="mb-6" />

        <div
          className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
            rejected ? 'bg-error/10 text-error' : 'bg-warning/15 text-warning'
          }`}
        >
          {rejected ? <XCircle size={24} /> : <Clock size={24} />}
        </div>

        {rejected ? (
          <>
            <h1 className="font-display text-xl font-semibold">Demande refusée</h1>
            <p className="mt-2 text-sm text-base-content/80">
              Votre demande d'inscription à <strong>{request.universityName}</strong> a été
              refusée. Ce compte ne donne accès à aucun espace.
            </p>
            {request.reason && (
              <p className="mt-3 rounded-box bg-base-200 p-3 text-sm">
                <span className="font-medium">Motif : </span>
                {request.reason}
              </p>
            )}
            <p className="mt-3 text-sm text-base-content/70">
              Pour toute question, contactez l'administration de votre université.
            </p>
          </>
        ) : approved ? (
          <>
            <h1 className="font-display text-xl font-semibold">Demande validée</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-base-content/80">
              <span className="loading loading-spinner loading-sm text-primary" />
              Ouverture de votre espace…
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold">Demande en attente</h1>
            <p className="mt-2 text-sm text-base-content/80">
              Votre demande est en attente de validation par votre université.
            </p>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-base-content/70">Université</dt>
              <dd className="font-medium">{request.universityName}</dd>
              <dt className="text-base-content/70">Rôle demandé</dt>
              <dd className="font-medium">{SIGNUP_ROLE_LABELS[request.requestedRole]}</dd>
            </dl>
            <p className="mt-4 text-sm text-base-content/70">
              Cette page se met à jour automatiquement dès que votre demande est traitée.
            </p>
          </>
        )}

        <button type="button" className="btn btn-outline btn-sm mt-6 gap-2" onClick={() => signOut()}>
          <LogOut size={15} />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
