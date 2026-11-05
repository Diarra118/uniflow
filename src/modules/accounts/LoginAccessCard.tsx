import { KeyRound, Send } from 'lucide-react'
import type { LoginAccessRole } from '@/core/firebase/functions'
import { useCreateLoginAccess, useResendAccountInvite } from './useCreateLoginAccess'
import { AccountInvitationDialog } from './AccountInvitationDialog'

/** État du compte de connexion d'une fiche, création de l'accès et renvoi
 * de l'invitation. */
export function LoginAccessCard({
  recordType,
  recordId,
  uid,
  name,
  email,
  canManage,
}: {
  recordType: LoginAccessRole
  recordId: string
  uid?: string
  name: string
  email: string
  canManage: boolean
}) {
  const access = useCreateLoginAccess()
  const invite = useResendAccountInvite()

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-base-content/50">Accès de connexion</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`badge badge-sm ${uid ? 'badge-success' : 'badge-ghost'}`}>
              {uid ? 'Accès créé' : "Pas d'accès"}
            </span>
          </div>
          <p className="mt-1 text-xs text-base-content/50">
            {uid
              ? `Connexion avec l'adresse ${email}.`
              : 'Cette personne ne peut pas encore se connecter à la plateforme.'}
          </p>
        </div>

        {canManage && !uid && (
          <button
            type="button"
            className="btn btn-outline btn-sm gap-2"
            disabled={access.creating}
            onClick={() => access.create({ recordType, recordId, name, email })}
          >
            {access.creating ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <KeyRound size={14} />
            )}
            Créer un accès de connexion
          </button>
        )}

        {canManage && uid && (
          <button
            type="button"
            className="btn btn-outline btn-sm gap-2"
            disabled={invite.sending}
            onClick={() => invite.resend({ recordType, recordId, email })}
          >
            {invite.sending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Send size={14} />
            )}
            Renvoyer l'invitation
          </button>
        )}
      </div>

      {access.error && <p className="mt-3 text-sm text-error">{access.error}</p>}
      {invite.error && <p className="mt-3 text-sm text-error">{invite.error}</p>}
      {invite.sentTo && (
        <p className="mt-3 text-sm text-success">Invitation renvoyée à {invite.sentTo}.</p>
      )}

      <AccountInvitationDialog info={access.invitation} onClose={access.dismissInvitation} />
    </div>
  )
}
