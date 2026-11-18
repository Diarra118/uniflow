import { useState, type FormEvent } from 'react'
import { Check, UserPlus, X } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { approveSignupRequest, rejectSignupRequest } from '@/core/firebase/functions'
import type { SignupRequest, SignupRequestStatus } from '@/core/types'
import { ListPage } from '@/shared/components/ListPage'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { countLabel, listSubtitle } from '@/shared/utils/plural'
import type { StatusTone } from '@/shared/utils/statusTone'
import { SIGNUP_ROLE_LABELS } from './schema'
import { useSignupRequests } from './useSignupRequests'

const STATUS: Record<SignupRequestStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'En attente', tone: 'warning' },
  processing: { label: 'En cours', tone: 'info' },
  approved: { label: 'Validée', tone: 'success' },
  rejected: { label: 'Refusée', tone: 'neutral' },
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function errorMessage(err: unknown) {
  const message = (err as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'L’opération a échoué. Réessayez.'
}

/**
 * Demandes d'auto-inscription de l'université de l'admin (règles : lecture
 * par l'admin actif de CETTE université seulement). Valider / refuser passe
 * par les fonctions serveur.
 */
export function SignupRequestsPage() {
  const { appUser, university } = useAuth()
  const universityId = appUser?.universityId ?? null
  const { requests, loading, error } = useSignupRequests(universityId)
  const [approving, setApproving] = useState<SignupRequest | null>(null)
  const [rejecting, setRejecting] = useState<SignupRequest | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const pending = requests.filter((r) => r.status === 'pending').length

  return (
    <ListPage
      title="Demandes d'inscription"
      subtitle={listSubtitle(countLabel(pending, 'demande en attente', 'demandes en attente'), university?.name)}
    >
      {notice && (
        <div role="status" className="alert alert-success alert-soft mb-4 text-sm">
          <span>{notice}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setNotice(null)}>
            Fermer
          </button>
        </div>
      )}

      {loading && <TableSkeleton cols={6} />}
      {!loading && error && <ErrorState description={error} />}
      {!loading && !error && requests.length === 0 && (
        <EmptyState
          icon={UserPlus}
          title="Aucune demande pour le moment"
          description="Les personnes qui s'inscrivent depuis la page « Créer un compte » apparaîtront ici."
        />
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>E-mail</th>
                <th>Rôle demandé</th>
                <th>Date</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.uid} className="hover">
                  <td>
                    {r.lastName} {r.firstName}
                  </td>
                  <td className="text-base-content/70">
                    {r.email}
                    {!r.emailVerified && (
                      <span className="block text-xs text-base-content/65">Adresse non vérifiée</span>
                    )}
                  </td>
                  <td>{SIGNUP_ROLE_LABELS[r.requestedRole]}</td>
                  <td className="text-base-content/70">{formatDate(r.createdAt)}</td>
                  <td>
                    <StatusBadge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusBadge>
                  </td>
                  <td>
                    {r.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <button className="btn btn-outline btn-xs gap-1" onClick={() => setRejecting(r)}>
                          <X size={13} />
                          Refuser
                        </button>
                        <button className="btn btn-primary btn-xs gap-1" onClick={() => setApproving(r)}>
                          <Check size={13} />
                          Valider
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approving && (
        <ApproveDialog
          request={approving}
          onClose={() => setApproving(null)}
          onDone={(name) => {
            setApproving(null)
            setNotice(`Demande validée : ${name} peut se connecter, sa fiche a été créée.`)
          }}
        />
      )}
      {rejecting && (
        <RejectDialog
          request={rejecting}
          onClose={() => setRejecting(null)}
          onDone={(name) => {
            setRejecting(null)
            setNotice(`Demande de ${name} refusée : le compte est désactivé.`)
          }}
        />
      )}
    </ListPage>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}

function RequestSummary({ request }: { request: SignupRequest }) {
  return (
    <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-box bg-base-200 p-3 text-sm">
      <dt className="text-base-content/70">Nom</dt>
      <dd className="font-medium">
        {request.firstName} {request.lastName}
      </dd>
      <dt className="text-base-content/70">E-mail</dt>
      <dd className="font-medium">
        {request.email}
        {!request.emailVerified && <span className="block text-xs font-normal text-base-content/70">Adresse non vérifiée : vérifiez l'identité de la personne.</span>}
      </dd>
      <dt className="text-base-content/70">Rôle demandé</dt>
      <dd className="font-medium">{SIGNUP_ROLE_LABELS[request.requestedRole]}</dd>
    </dl>
  )
}

function ApproveDialog({ request, onClose, onDone }: { request: SignupRequest; onClose: () => void; onDone: (name: string) => void }) {
  const [number, setNumber] = useState('')
  const [department, setDepartment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isTeacher = request.requestedRole === 'teacher'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!number.trim()) {
      setError('Le matricule est requis.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await approveSignupRequest({
        uid: request.uid,
        number: number.trim(),
        ...(isTeacher && department.trim() ? { department: department.trim() } : {}),
      })
      onDone(`${request.firstName} ${request.lastName}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog title="Valider la demande" onClose={onClose}>
      <RequestSummary request={request} />
      <p className="mb-3 text-sm text-base-content/80">
        La validation crée la fiche {isTeacher ? 'enseignant' : 'étudiant'} liée à ce compte et
        ouvre ses droits.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="approve-number">
            <span className="label-text text-xs">{isTeacher ? 'Matricule employé' : 'Matricule étudiant'}</span>
          </label>
          <input id="approve-number" className="input input-bordered w-full" value={number}
            onChange={(e) => setNumber(e.target.value)} autoFocus />
        </div>
        {isTeacher && (
          <div>
            <label className="label" htmlFor="approve-department">
              <span className="label-text text-xs">Département (optionnel)</span>
            </label>
            <input id="approve-department" className="input input-bordered w-full" value={department}
              onChange={(e) => setDepartment(e.target.value)} />
          </div>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Valider'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function RejectDialog({ request, onClose, onDone }: { request: SignupRequest; onClose: () => void; onDone: (name: string) => void }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await rejectSignupRequest({ uid: request.uid, ...(reason.trim() ? { reason: reason.trim() } : {}) })
      onDone(`${request.firstName} ${request.lastName}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog title="Refuser la demande" onClose={onClose}>
      <RequestSummary request={request} />
      <p className="mb-3 text-sm text-base-content/80">
        Le compte sera désactivé ; la personne verra que sa demande a été refusée.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="reject-reason">
            <span className="label-text text-xs">Motif (facultatif, visible par la personne)</span>
          </label>
          <textarea id="reject-reason" className="textarea textarea-bordered w-full" rows={3}
            maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-error" disabled={submitting}>
            {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Refuser'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
