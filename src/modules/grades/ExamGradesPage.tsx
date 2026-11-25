import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardCheck, Pencil, Trash2, Users, X } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { tenantDocPath } from '@/core/firebase/paths'
import type { Exam, Grade, StudentProfile } from '@/core/types'
import { useNode } from '@/modules/dashboard/useDashboardData'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import { countLabel } from '@/shared/utils/plural'
import { correctGrade, deleteGrade, saveExamGrades, type GradeEntry } from './api'
import { examAverage, studentsToGrade } from './grading'
import { useGradesOfExams } from './hooks'
import { COMMENT_MAX, EXAM_TYPE_LABELS, formatExamDate, formatScore, parseScore } from './schema'
import { useGradingScope } from './useGradingScope'

type Draft = { value?: string; comment?: string }

/**
 * Notes d'un examen. Enseignant du cours : saisie dans un tableau, une
 * ligne par étudiant de la filière, enregistrée en une écriture atomique.
 * Admin : lecture, correction d'une note, suppression après confirmation.
 */
export function ExamGradesPage() {
  const { examId = '' } = useParams()
  const { appUser } = useAuth()
  const scope = useGradingScope()
  const uid = scope.universityId
  const exam = useNode<Omit<Exam, 'id'>>(uid && examId ? tenantDocPath(uid, 'exams', examId) : null)
  const examIds = useMemo(() => (examId ? [examId] : null), [examId])
  const grades = useGradesOfExams(uid, exam.data ? examIds : null)
  useDocumentTitle(exam.data?.title ?? 'Notes')

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [correcting, setCorrecting] = useState<{ grade: Grade; student: StudentProfile } | null>(null)
  const [deleting, setDeleting] = useState<{ grade: Grade; student: StudentProfile } | null>(null)

  const course = exam.data ? scope.allCourses?.find((c) => c.id === exam.data!.courseId) : undefined
  const expected = useMemo(
    () => (scope.students && course ? studentsToGrade(scope.students, course) : null),
    [scope.students, course]
  )
  const examGrades = grades.gradesByExam?.get(examId) ?? null
  const byStudent = useMemo(() => new Map((examGrades ?? []).map((g) => [g.studentId, g])), [examGrades])
  // Notes de fiches hors liste (changement de filière, étudiant retiré) : affichées à part pour l'admin.
  const studentById = useMemo(() => new Map((scope.students ?? []).map((s) => [s.id, s])), [scope.students])

  const back = (
    <Link to="/app/notes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-base-content/70 hover:text-base-content">
      <ArrowLeft size={15} />
      Retour aux notes
    </Link>
  )

  if (exam.error || (exam.data === null && grades.error)) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {back}
        <EmptyState icon={ClipboardCheck} title="Examen introuvable" description="Cet examen n'existe pas ou n'appartient pas à vos cours." />
      </div>
    )
  }
  if (scope.error || grades.error) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {back}
        <ErrorState description="Impossible de charger les notes de cet examen." />
      </div>
    )
  }
  if (!exam.data || !expected || !examGrades || !scope.allCourses) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        {back}
        <TableSkeleton rows={6} cols={4} />
      </div>
    )
  }

  const e: Exam = { ...exam.data, id: examId }
  const editable = !scope.isAdmin
  const average = examAverage(examGrades)
  const others = scope.isAdmin
    ? examGrades.filter((g) => !expected.some((s) => s.id === g.studentId))
    : []

  const valueOf = (s: StudentProfile) => drafts[s.id]?.value ?? (byStudent.has(s.id) ? formatScore(byStudent.get(s.id)!.value) : '')
  const commentOf = (s: StudentProfile) => drafts[s.id]?.comment ?? byStudent.get(s.id)?.comment ?? ''
  const setDraft = (id: string, patch: Draft) => {
    setNotice(null)
    setRowErrors((r) => {
      const { [id]: _drop, ...rest } = r
      return rest
    })
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  async function handleSave(ev: FormEvent) {
    ev.preventDefault()
    if (!uid || !appUser) return
    const errors: Record<string, string> = {}
    const entries: GradeEntry[] = []
    for (const s of expected!) {
      if (!drafts[s.id]) continue
      const prev = byStudent.get(s.id)
      const parsed = parseScore(valueOf(s), e.maxScore)
      const comment = commentOf(s).trim()
      if (parsed.error) {
        errors[s.id] = parsed.error
        continue
      }
      if (parsed.value === null) {
        if (prev) errors[s.id] = 'Une note enregistrée ne peut pas être vidée.'
        else if (comment) errors[s.id] = 'Saisissez une note avec l’appréciation.'
        continue
      }
      if (comment.length > COMMENT_MAX) {
        errors[s.id] = `Appréciation : ${COMMENT_MAX} caractères au plus.`
        continue
      }
      if (prev && prev.value === parsed.value && (prev.comment ?? '') === comment) continue
      entries.push({ studentId: s.id, value: parsed.value, comment })
    }
    setRowErrors(errors)
    if (Object.keys(errors).length) {
      setNotice({ tone: 'error', text: `${countLabel(Object.keys(errors).length, 'ligne à corriger', 'lignes à corriger')} : rien n'a été enregistré.` })
      return
    }
    if (entries.length === 0) {
      setNotice({ tone: 'info', text: 'Aucune modification à enregistrer.' })
      return
    }
    setSaving(true)
    try {
      await saveExamGrades(uid, e, entries, byStudent, appUser.uid)
      setDrafts({})
      setNotice({ tone: 'success', text: `${countLabel(entries.length, 'note enregistrée', 'notes enregistrées')}.` })
    } catch (err) {
      console.error('saveExamGrades', err)
      setNotice({ tone: 'error', text: "L'enregistrement a échoué : aucune note n'a été modifiée. Réessayez." })
    } finally {
      setSaving(false)
    }
  }

  const dirty = Object.keys(drafts).length > 0

  return (
    <div className="mx-auto w-full max-w-6xl">
      {back}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-base-content/70">
            <span className="font-mono-data">{course?.code}</span> · {course?.name}
          </p>
          <h1 className="font-display text-2xl font-semibold">{e.title}</h1>
          <p className="mt-0.5 text-sm text-base-content/70">
            {EXAM_TYPE_LABELS[e.type]} · {formatExamDate(e.date)} · coefficient {formatScore(e.coefficient)} · noté sur {formatScore(e.maxScore)}
          </p>
        </div>
        <dl className="flex gap-6 text-sm" data-testid="exam-summary">
          <div>
            <dt className="text-base-content/70">Notes saisies</dt>
            <dd className="font-display text-xl font-semibold" data-graded>
              {expected.filter((s) => byStudent.has(s.id)).length} / {expected.length}
            </dd>
          </div>
          <div>
            <dt className="text-base-content/70">Moyenne</dt>
            <dd className="font-display text-xl font-semibold" data-average>
              {average === null ? '—' : `${formatScore(average)} / ${formatScore(e.maxScore)}`}
            </dd>
          </div>
        </dl>
      </div>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`alert mb-4 text-sm ${notice.tone === 'success' ? 'alert-success' : notice.tone === 'error' ? 'alert-error' : 'alert-info'}`}
        >
          <span>{notice.text}</span>
        </div>
      )}

      {expected.length === 0 ? (
        <EmptyState icon={Users} title="Aucun étudiant à noter" description="Aucun étudiant inscrit dans la filière de ce cours." />
      ) : (
        <form onSubmit={handleSave} noValidate>
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table" data-testid="grades-table">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Étudiant</th>
                  <th className="w-32">Note / {formatScore(e.maxScore)}</th>
                  <th>Appréciation</th>
                  {!editable && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {expected.map((s) => {
                  const g = byStudent.get(s.id)
                  const name = `${s.firstName} ${s.lastName}`
                  return (
                    <tr key={s.id} data-student={s.studentNumber}>
                      <td className="font-mono-data text-xs">{s.studentNumber}</td>
                      <td className="whitespace-nowrap">{name}</td>
                      {editable ? (
                        <>
                          <td>
                            <input
                              aria-label={`Note de ${name}`}
                              inputMode="decimal"
                              className={`input input-bordered input-sm w-24 ${rowErrors[s.id] ? 'input-error' : ''}`}
                              value={valueOf(s)}
                              onChange={(ev) => setDraft(s.id, { value: ev.target.value })}
                            />
                            {rowErrors[s.id] && <p className="mt-1 text-xs text-error">{rowErrors[s.id]}</p>}
                          </td>
                          <td>
                            <input
                              aria-label={`Appréciation pour ${name}`}
                              className="input input-bordered input-sm w-full min-w-48"
                              maxLength={COMMENT_MAX}
                              value={commentOf(s)}
                              onChange={(ev) => setDraft(s.id, { comment: ev.target.value })}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="dash-number font-medium" data-value>
                            {g ? formatScore(g.value) : <span className="text-base-content/60">Non noté</span>}
                          </td>
                          <td className="text-sm text-base-content/80">{g?.comment ?? ''}</td>
                          <td>
                            {g && (
                              <div className="flex justify-end gap-1">
                                <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={() => setCorrecting({ grade: g, student: s })}>
                                  <Pencil size={13} /> Corriger
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs btn-circle"
                                  aria-label={`Supprimer la note de ${name}`}
                                  onClick={() => setDeleting({ grade: g, student: s })}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
                {others.map((g) => {
                  const s = studentById.get(g.studentId)
                  return (
                    <tr key={g.id} className="text-base-content/70">
                      <td className="font-mono-data text-xs">{s?.studentNumber ?? '—'}</td>
                      <td>{s ? `${s.firstName} ${s.lastName}` : 'Fiche supprimée'} (hors filière)</td>
                      <td className="dash-number">{formatScore(g.value)}</td>
                      <td className="text-sm">{g.comment ?? ''}</td>
                      <td />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {editable && (
            <div className="mt-4 flex items-center justify-end gap-3">
              {dirty && <span className="text-sm text-base-content/70">Modifications non enregistrées</span>}
              <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
                {saving ? <span className="loading loading-spinner loading-sm" /> : 'Enregistrer les notes'}
              </button>
            </div>
          )}
        </form>
      )}

      {correcting && (
        <CorrectGradeModal
          exam={e}
          grade={correcting.grade}
          studentName={`${correcting.student.firstName} ${correcting.student.lastName}`}
          onClose={() => setCorrecting(null)}
          onSubmit={async (value, comment) => {
            await correctGrade(uid!, correcting.grade, value, comment, appUser!.uid)
            setNotice({ tone: 'success', text: `Note de ${correcting.student.firstName} ${correcting.student.lastName} corrigée.` })
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteModal
          studentName={`${deleting.student.firstName} ${deleting.student.lastName}`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteGrade(uid!, deleting.grade.id)
            setNotice({ tone: 'success', text: `Note de ${deleting.student.firstName} ${deleting.student.lastName} supprimée.` })
          }}
        />
      )}
    </div>
  )
}

function CorrectGradeModal({
  exam,
  grade,
  studentName,
  onClose,
  onSubmit,
}: {
  exam: Exam
  grade: Grade
  studentName: string
  onClose: () => void
  onSubmit: (value: number, comment: string) => Promise<void>
}) {
  const [value, setValue] = useState(formatScore(grade.value))
  const [comment, setComment] = useState(grade.comment ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const parsed = parseScore(value, exam.maxScore)
    if (parsed.error || parsed.value === null) {
      setError(parsed.error ?? 'Une note enregistrée ne peut pas être vidée.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(parsed.value, comment)
      onClose()
    } catch {
      setError("La correction a échoué. Réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md" role="dialog" aria-labelledby="correct-title">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="correct-title" className="font-display text-lg font-semibold">Corriger la note</h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} type="button" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-sm text-base-content/70">
          {studentName} · {exam.title}
        </p>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div>
            <label className="label" htmlFor="correct-value">
              <span className="label-text text-xs">Note sur {formatScore(exam.maxScore)}</span>
            </label>
            <input
              id="correct-value"
              inputMode="decimal"
              className={`input input-bordered w-full ${error ? 'input-error' : ''}`}
              value={value}
              onChange={(ev) => { setValue(ev.target.value); setError(null) }}
            />
          </div>
          <div>
            <label className="label" htmlFor="correct-comment">
              <span className="label-text text-xs">Appréciation (facultative)</span>
            </label>
            <textarea
              id="correct-comment"
              className="textarea textarea-bordered w-full"
              rows={2}
              maxLength={COMMENT_MAX}
              value={comment}
              onChange={(ev) => setComment(ev.target.value)}
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Enregistrer la correction'}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}

function ConfirmDeleteModal({ studentName, onClose, onConfirm }: { studentName: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-desc">
        <h3 id="delete-title" className="font-display text-lg font-semibold">Supprimer la note ?</h3>
        <p id="delete-desc" className="mt-2 text-sm text-base-content/80">
          La note de {studentName} sera définitivement supprimée. Cette action ne peut pas être annulée.
        </p>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            type="button"
            className="btn btn-error"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onClose()
              } catch {
                setError('La suppression a échoué. Réessayez.')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <span className="loading loading-spinner loading-sm" /> : 'Supprimer'}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}
