import { FUNCTIONS_ENABLED } from '@/core/config/features'
import { LocalOnlyNotice } from '@/shared/components/LocalOnlyNotice'

/** Option « Créer un accès de connexion » des formulaires de création.
 * Version hébergée (sans Cloud Functions) : case masquée, message à la place
 * (la case reste décochée, aucune création d'accès n'est demandée). */
export function CreateLoginAccessCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  if (!FUNCTIONS_ENABLED) {
    return (
      <div className="rounded-box border border-base-300 p-3" data-testid="login-access-local-only">
        <span className="block text-sm font-medium">Accès de connexion</span>
        <LocalOnlyNotice className="mt-1 text-xs" />
      </div>
    )
  }
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-box border border-base-300 p-3">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-sm mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">Créer un accès de connexion</span>
        <span className="block text-xs text-base-content/65">
          Un compte sera créé avec l'adresse e-mail de la fiche, et la personne recevra une invitation
          par e-mail pour définir son mot de passe.
        </span>
      </span>
    </label>
  )
}
