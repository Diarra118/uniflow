/** Option « Créer un accès de connexion » des formulaires de création. */
export function CreateLoginAccessCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
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
        <span className="block text-xs text-base-content/50">
          Un compte sera créé avec l'email de la fiche, et la personne recevra une invitation
          par email pour définir son mot de passe.
        </span>
      </span>
    </label>
  )
}
