import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { programFormSchema, type ProgramFormValues } from './schema'
import type { Program } from '@/core/types'

const EMPTY: ProgramFormValues = { name: '', code: '', description: '', durationYears: 3 }

export function ProgramFormModal({
  open,
  program,
  onClose,
  onSubmit,
}: {
  open: boolean
  program: Program | null
  onClose: () => void
  onSubmit: (values: ProgramFormValues) => Promise<void>
}) {
  const [values, setValues] = useState<ProgramFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValues(
      program
        ? {
            name: program.name,
            code: program.code,
            description: program.description ?? '',
            durationYears: program.durationYears ?? 3,
          }
        : EMPTY
    )
    setFieldErrors({})
    setSubmitError(null)
  }, [open, program])

  if (!open) return null

  function set<K extends keyof ProgramFormValues>(key: K, value: ProgramFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = programFormSchema.safeParse(values)
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
            {program ? 'Modifier la filière' : 'Nouvelle filière'}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">
                <span className="label-text text-xs">Nom</span>
              </label>
              <input
                className={`input input-bordered w-full ${fieldErrors.name ? 'input-error' : ''}`}
                value={values.name}
                onChange={(e) => set('name', e.target.value)}
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-error">{fieldErrors.name}</p>}
            </div>
            <div>
              <label className="label">
                <span className="label-text text-xs">Code</span>
              </label>
              <input
                className={`input input-bordered w-full ${fieldErrors.code ? 'input-error' : ''}`}
                value={values.code}
                onChange={(e) => set('code', e.target.value)}
              />
              {fieldErrors.code && <p className="mt-1 text-xs text-error">{fieldErrors.code}</p>}
            </div>
            <div>
              <label className="label">
                <span className="label-text text-xs">Durée (années)</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                className={`input input-bordered w-full ${fieldErrors.durationYears ? 'input-error' : ''}`}
                value={values.durationYears}
                onChange={(e) => set('durationYears', Number(e.target.value))}
              />
              {fieldErrors.durationYears && (
                <p className="mt-1 text-xs text-error">{fieldErrors.durationYears}</p>
              )}
            </div>
          </div>

          <div>
            <label className="label">
              <span className="label-text text-xs">Description (optionnelle)</span>
            </label>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              value={values.description ?? ''}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {submitError && <p className="text-sm text-error">{submitError}</p>}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : program ? (
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
