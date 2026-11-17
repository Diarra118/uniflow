import { MailCheck, MailWarning } from 'lucide-react'
import type { InvitationInfo } from './useCreateLoginAccess'

/**
 * Confirmation après création d'un accès. Aucun lien n'est affiché : la
 * personne reçoit directement par email le lien de définition du mot de passe.
 */
export function AccountInvitationDialog({
  info,
  onClose,
}: {
  info: InvitationInfo | null
  onClose: () => void
}) {
  if (!info) return null

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-lg">
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              info.invitationSent ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            }`}
          >
            {info.invitationSent ? <MailCheck size={18} /> : <MailWarning size={18} />}
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Accès de connexion créé</h3>
            <p className="text-sm text-base-content/70">{info.name}</p>
          </div>
        </div>

        {info.invitationSent ? (
          <p className="text-sm">
            Invitation envoyée à <span className="font-medium">{info.email}</span>. La personne
            y trouvera un lien pour définir son mot de passe (valable environ 1 heure). Si le
            lien expire, utilisez « Renvoyer l'invitation » depuis la fiche.
          </p>
        ) : (
          <div className="alert alert-warning text-sm">
            Le compte est créé, mais l'invitation n'a pas pu être envoyée à {info.email}.
            Utilisez « Renvoyer l'invitation » depuis la fiche.
          </div>
        )}

        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}
