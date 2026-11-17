import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import {
  studentFormSchema,
  ENROLLMENT_STATUS_LABELS,
  type StudentFormValues,
} from './schema'
import type { StudentProfile } from '@/core/types'
import { useAuth } from '@/core/firebase/AuthContext'
import { usePrograms } from '@/modules/programs/usePrograms'
import { useClasses } from '@/modules/classes/useClasses'
import { CreateLoginAccessCheckbox } from '@/modules/accounts/CreateLoginAccessCheckbox'

const EMPTY: StudentFormValues = {
  studentNumber: '',
  firstName: '',
  lastName: '',
  email: '',
  classId: '',
  programId: '',
  enrollmentStatus: 'pending',
}

export function StudentFormModal({
  open,
  student,
  onClose,
  onSubmit,
}: {
  open: boolean
  student: StudentProfile | null
  onClose: () => void
  onSubmit: (values: StudentFormValues, options: { createLoginAccess: boolean }) => Promise<void>
}) {
  const { appUser } = useAuth()
  const universityId = appUser?.universityId ?? null
  const { programs } = usePrograms(universityId)
  const { classes } = useClasses(universityId)

  const [values, setValues] = useState<StudentFormValues>(EMPTY)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createLoginAccess, setCreateLoginAccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setCreateLoginAccess(false)
    setValues(
      student
        ? {
            studentNumber: student.studentNumber,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            classId: student.classId ?? '',
            programId: student.programId ?? '',
            enrollmentStatus: student.enrollmentStatus,
          }
        : EMPTY
    )
    setFieldErrors({})
    setSubmitError(null)
  }, [open, student])

  if (!open) return null

  function set<K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    const parsed = studentFormSchema.safeParse(values)
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      setFieldErrors(errs)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await onSubmit(parsed.data, { createLoginAccess: !student && createLoginAccess })
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
            {student ? "Modifier l'étudiant" : 'Nouvel étudiant'}
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
            label="Matricule"
            value={values.studentNumber}
            error={fieldErrors.studentNumber}
            onChange={(v) => set('studentNumber', v)}
          />
          <Field
            label="E-mail"
            type="email"
            value={values.email}
            error={fieldErrors.email}
            onChange={(v) => set('email', v)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="programId">
                <span className="label-text text-xs">Filière (optionnelle)</span>
              </label>
              <select
                id="programId"
                className="select select-bordered w-full"
                value={values.programId ?? ''}
                onChange={(e) => {
                  const programId = e.target.value
                  setValues((v) => {
                    // Si la classe sélectionnée n'appartient plus à la
                    // nouvelle filière, on la réinitialise pour éviter une
                    // association incohérente.
                    const currentClass = classes.find((c) => c.id === v.classId)
                    const classStillValid = currentClass?.programId === programId
                    return { ...v, programId, classId: classStillValid ? v.classId : '' }
                  })
                }}
              >
                <option value="">Non renseignée</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="classId">
                <span className="label-text text-xs">Classe (optionnelle)</span>
              </label>
              <select
                id="classId"
                className="select select-bordered w-full"
                value={values.classId ?? ''}
                onChange={(e) => set('classId', e.target.value)}
                disabled={!values.programId}
              >
                <option value="">Non renseignée</option>
                {classes
                  .filter((c) => c.programId === values.programId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              {!values.programId && (
                <p className="mt-1 text-xs text-base-content/65">
                  Sélectionnez d'abord une filière.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="enrollmentStatus">
              <span className="label-text text-xs">Statut d'inscription</span>
            </label>
            <select
              id="enrollmentStatus"
              className="select select-bordered w-full"
              value={values.enrollmentStatus}
              onChange={(e) =>
                set('enrollmentStatus', e.target.value as StudentFormValues['enrollmentStatus'])
              }
            >
              {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {!student && (
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
              ) : student ? (
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
