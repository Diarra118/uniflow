import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { CourseUnit } from '@/core/types'
import { EXAM_TYPES, EXAM_TYPE_LABELS, examFormSchema, todayIso, type ExamFormValues } from './schema'

type FormState = { title: string; type: string; date: string; coefficient: string; maxScore: string }

const empty = (): FormState => ({ title: '', type: 'homework', date: todayIso(), coefficient: '1', maxScore: '20' })

/** Création d'un examen pour un cours. Le cours et la note maximale ne
 * pourront plus être modifiés ensuite (règles). Monté à chaque ouverture
 * (key = cours) : l'état repart du formulaire vide. */
export function ExamFormModal({
  course,
  onClose,
  onSubmit,
}: {
  course: CourseUnit
  onClose: () => void
  onSubmit: (values: ExamFormValues) => Promise<void>
}) {
  const [values, setValues] = useState<FormState>(empty)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const set = (key: keyof FormState, value: string) => setValues((v) => ({ ...v, [key]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const parsed = examFormSchema.safeParse({
      ...values,
      coefficient: values.coefficient.replace(',', '.'),
      maxScore: values.maxScore.replace(',', '.'),
    })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] ??= issue.message
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

  const err = (k: string) => fieldErrors[k] && <p className="mt-1 text-xs text-error">{fieldErrors[k]}</p>

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md" role="dialog" aria-labelledby="exam-form-title">
        <div className="mb-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 id="exam-form-title" className="font-display text-lg font-semibold">
              Nouvel examen
            </h3>
            <p className="truncate text-sm text-base-content/70">
              <span className="font-mono-data">{course.code}</span> · {course.name}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label className="label" htmlFor="exam-title">
              <span className="label-text text-xs">Titre</span>
            </label>
            <input
              id="exam-title"
              className={`input input-bordered w-full ${fieldErrors.title ? 'input-error' : ''}`}
              value={values.title}
              maxLength={120}
              placeholder="Partiel de mi-semestre"
              onChange={(e) => set('title', e.target.value)}
            />
            {err('title')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="exam-type">
                <span className="label-text text-xs">Type</span>
              </label>
              <select
                id="exam-type"
                className={`select select-bordered w-full ${fieldErrors.type ? 'select-error' : ''}`}
                value={values.type}
                onChange={(e) => set('type', e.target.value)}
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EXAM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {err('type')}
            </div>
            <div>
              <label className="label" htmlFor="exam-date">
                <span className="label-text text-xs">Date</span>
              </label>
              <input
                id="exam-date"
                type="date"
                className={`input input-bordered w-full ${fieldErrors.date ? 'input-error' : ''}`}
                value={values.date}
                onChange={(e) => set('date', e.target.value)}
              />
              {err('date')}
            </div>
            <div>
              <label className="label" htmlFor="exam-coefficient">
                <span className="label-text text-xs">Coefficient</span>
              </label>
              <input
                id="exam-coefficient"
                inputMode="decimal"
                className={`input input-bordered w-full ${fieldErrors.coefficient ? 'input-error' : ''}`}
                value={values.coefficient}
                onChange={(e) => set('coefficient', e.target.value)}
              />
              {err('coefficient')}
            </div>
            <div>
              <label className="label" htmlFor="exam-max">
                <span className="label-text text-xs">Note maximale</span>
              </label>
              <input
                id="exam-max"
                inputMode="decimal"
                className={`input input-bordered w-full ${fieldErrors.maxScore ? 'input-error' : ''}`}
                value={values.maxScore}
                onChange={(e) => set('maxScore', e.target.value)}
              />
              {err('maxScore')}
            </div>
          </div>
          <p className="text-xs text-base-content/70">
            Le cours et la note maximale ne pourront plus être modifiés une fois l'examen créé.
          </p>

          {submitError && <p className="text-sm text-error">{submitError}</p>}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Créer'}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}
