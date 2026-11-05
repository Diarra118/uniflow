import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { teacherFormSchema, type TeacherFormValues } from './schema'
import type { TeacherProfile } from '@/core/types'
import { CreateLoginAccessCheckbox } from '@/modules/accounts/CreateLoginAccessCheckbox'

const EMPTY: TeacherFormValues = {
  employeeNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  department: '',
}

export function TeacherFormModal({
  open,
  teacher,
  onClose,
  onSubmit,
}: {
  open: boolean
  teacher: TeacherProfile | null
  onClose: () => void
  onSubmit: (values: TeacherFormValues, options: { createLoginAccess: boolean }) => Promise<void>
}) {
  const [values, setValues] = useState<TeacherFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createLoginAccess, setCreateLoginAccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setCreateLoginAccess(false)
    setValues(
      teacher
        ? {
            employeeNumber: teacher.employeeNumber,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.email,
            department: teacher.department ?? '',
          }
        : EMPTY
    )
    setFieldErrors({})
    setSubmitError(null)
  }, [open, teacher])

  if (!open) return null

  function set<K extends keyof TeacherFormValues>(key: K, value: TeacherFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = teacherFormSchema.safeParse(values)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await onSubmit(parsed.data, { createLoginAccess: !teacher && createLoginAccess })
      onClose()
    } catch {
      setSubmitError("L'enregistrement a échoué. Réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">
            {teacher ? "Modifier l'enseignant" : 'Nouvel enseignant'}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Prénom"
              value={values.firstName}
              error={fieldErrors.firstName}
              onChange={(v) => set('firstName', v)}
            />
            <Field
              label="Nom"
              value={values.lastName}
              error={fieldErrors.lastName}
              onChange={(v) => set('lastName', v)}
            />
          </div>
          <Field
            label="Matricule employé"
            value={values.employeeNumber}
            error={fieldErrors.employeeNumber}
            onChange={(v) => set('employeeNumber', v)}
          />
          <Field
            label="Email"
            type="email"
            value={values.email}
            error={fieldErrors.email}
            onChange={(v) => set('email', v)}
          />
          <Field
            label="Département (optionnel)"
            value={values.department ?? ''}
            onChange={(v) => set('department', v)}
          />

          {!teacher && (
            <CreateLoginAccessCheckbox checked={createLoginAccess} onChange={setCreateLoginAccess} />
          )}

          {submitError && <p className="text-sm text-error">{submitError}</p>}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : teacher ? (
                'Enregistrer'
              ) : (
                'Créer'
              )}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}

function Field({
  label,
  value,
  error,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  error?: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="label">
        <span className="label-text text-xs">{label}</span>
      </label>
      <input
        type={type}
        className={`input input-bordered w-full ${error ? 'input-error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}
