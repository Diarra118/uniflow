import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { courseFormSchema, type CourseFormValues } from './schema'
import type { CourseUnit, Program, TeacherProfile } from '@/core/types'

const EMPTY: CourseFormValues = { name: '', code: '', programId: '', teacherId: '', credits: undefined }

export function CourseFormModal({
  open,
  course,
  programs,
  teachers,
  onClose,
  onSubmit,
}: {
  open: boolean
  course: CourseUnit | null
  programs: Program[]
  teachers: TeacherProfile[]
  onClose: () => void
  onSubmit: (values: CourseFormValues) => Promise<void>
}) {
  const [values, setValues] = useState<CourseFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setValues(
      course
        ? {
            name: course.name,
            code: course.code,
            programId: course.programId,
            teacherId: course.teacherId ?? '',
            credits: course.credits,
          }
        : EMPTY
    )
    setFieldErrors({})
    setSubmitError(null)
  }, [open, course])

  if (!open) return null

  function set<K extends keyof CourseFormValues>(key: K, value: CourseFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = courseFormSchema.safeParse(values)
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
            {course ? 'Modifier le cours' : 'Nouveau cours'}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">
                <span className="label-text text-xs">Nom du cours</span>
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
                <span className="label-text text-xs">Crédits (optionnel)</span>
              </label>
              <input
                type="number"
                min={0}
                max={60}
                className="input input-bordered w-full"
                value={values.credits ?? ''}
                onChange={(e) =>
                  set('credits', e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </div>
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

          <div>
            <label className="label">
              <span className="label-text text-xs">Enseignant (optionnel)</span>
            </label>
            <select
              className="select select-bordered w-full"
              value={values.teacherId}
              onChange={(e) => set('teacherId', e.target.value)}
            >
              <option value="">Non attribué</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.lastName} {t.firstName}
                </option>
              ))}
            </select>
          </div>

          {submitError && <p className="text-sm text-error">{submitError}</p>}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : course ? (
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
