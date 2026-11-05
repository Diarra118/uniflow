import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { classFormSchema, type ClassFormValues } from './schema'
import type { ClassGroup, Program } from '@/core/types'

const EMPTY: ClassFormValues = { name: '', programId: '', level: '', academicYearLabel: '' }

export function ClassFormModal({
  open,
  classGroup,
  programs,
  onClose,
  onSubmit,
}: {
  open: boolean
  classGroup: ClassGroup | null
  programs: Program[]
  onClose: () => void
  onSubmit: (values: ClassFormValues) => Promise<void>
}) {
  const [values, setValues] = useState<ClassFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValues(
      classGroup
        ? {
            name: classGroup.name,
            programId: classGroup.programId,
            level: classGroup.level ?? '',
            academicYearLabel: classGroup.academicYearLabel ?? '',
          }
        : EMPTY
    )
    setFieldErrors({})
    setSubmitError(null)
  }, [open, classGroup])

  if (!open) return null

  function set<K extends keyof ClassFormValues>(key: K, value: ClassFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = classFormSchema.safeParse(values)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await onSubmit(parsed.data)
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
            {classGroup ? 'Modifier la classe' : 'Nouvelle classe'}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">
              <span className="label-text text-xs">Nom de la classe</span>
            </label>
            <input
              className={`input input-bordered w-full ${fieldErrors.name ? 'input-error' : ''}`}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="ex. L1 Informatique A"
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-error">{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="label">
              <span className="label-text text-xs">Filière</span>
            </label>
            <select
              className={`select select-bordered w-full ${fieldErrors.programId ? 'select-error' : ''}`}
              value={values.programId}
              onChange={(e) => set('programId', e.target.value)}
            >
              <option value="">Sélectionner une filière</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            {fieldErrors.programId && (
              <p className="mt-1 text-xs text-error">{fieldErrors.programId}</p>
            )}
            {programs.length === 0 && (
              <p className="mt-1 text-xs text-warning">
                Aucune filière disponible — créez-en une d'abord.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">
                <span className="label-text text-xs">Niveau (optionnel)</span>
              </label>
              <input
                className="input input-bordered w-full"
                value={values.level ?? ''}
                onChange={(e) => set('level', e.target.value)}
                placeholder="ex. L1"
              />
            </div>
            <div>
              <label className="label">
                <span className="label-text text-xs">Année académique (optionnelle)</span>
              </label>
              <input
                className="input input-bordered w-full"
                value={values.academicYearLabel ?? ''}
                onChange={(e) => set('academicYearLabel', e.target.value)}
                placeholder="ex. 2025-2026"
              />
            </div>
          </div>

          {submitError && <p className="text-sm text-error">{submitError}</p>}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : classGroup ? (
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
