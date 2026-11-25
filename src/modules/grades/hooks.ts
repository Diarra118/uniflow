import { useEffect, useMemo, useState } from 'react'
import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { Exam, Grade } from '@/core/types'

/**
 * Lecture en direct d'une ou plusieurs listes. Les règles n'ouvrent les
 * notes et les examens que par requête (orderByChild + equalTo) : chaque
 * spécification est soit la collection entière (examens, admin), soit une
 * requête sur un champ.
 */
interface Spec {
  key: string
  path: string
  child?: string
  value?: string
}

interface MultiState<T> {
  sig: string
  rows: Record<string, T[]>
  error: boolean
}

function useLiveLists<T>(specs: Spec[]): { byKey: Map<string, T[]> | null; error: boolean } {
  const sig = specs.map((s) => `${s.key}|${s.path}|${s.child ?? ''}|${s.value ?? ''}`).join('\n')
  const [state, setState] = useState<MultiState<T>>({ sig: '', rows: {}, error: false })

  useEffect(() => {
    if (specs.length === 0) return
    const unsubs = specs.map((s) => {
      const base = ref(rtdb, s.path)
      const q = s.child && s.value !== undefined ? query(base, orderByChild(s.child), equalTo(s.value)) : base
      return onValue(
        q,
        (snap) => {
          const rows: T[] = []
          snap.forEach((c) => {
            rows.push({ ...(c.val() as object), id: c.key as string } as T)
          })
          setState((prev) => ({
            sig,
            rows: { ...(prev.sig === sig ? prev.rows : {}), [s.key]: rows },
            error: prev.sig === sig ? prev.error : false,
          }))
        },
        () => setState((prev) => ({ sig, rows: prev.sig === sig ? prev.rows : {}, error: true }))
      )
    })
    return () => unsubs.forEach((u) => u())
    // `sig` résume entièrement `specs`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  return useMemo(() => {
    if (specs.length === 0) return { byKey: new Map(), error: false }
    if (state.sig !== sig) return { byKey: null, error: false }
    if (state.error) return { byKey: null, error: true }
    const done = specs.every((s) => s.key in state.rows)
    return { byKey: done ? new Map(Object.entries(state.rows)) : null, error: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sig])
}

/** Examens de plusieurs cours (une requête par cours) : enseignant, étudiant. */
export function useExamsOfCourses(universityId: string | null, courseIds: string[] | null) {
  const specs = useMemo<Spec[]>(
    () =>
      universityId && courseIds
        ? [...courseIds].sort().map((id) => ({ key: id, path: tenantCollectionPath(universityId, 'exams'), child: 'courseId', value: id }))
        : [],
    [universityId, courseIds]
  )
  const { byKey, error } = useLiveLists<Exam>(specs)
  const ready = universityId !== null && courseIds !== null
  return { exams: ready && byKey ? [...byKey.values()].flat() : null, error }
}

/** Tous les examens de l'université (admin : seule lecture complète ouverte). */
export function useAllExams(universityId: string | null) {
  const specs = useMemo<Spec[]>(
    () => (universityId ? [{ key: 'all', path: tenantCollectionPath(universityId, 'exams') }] : []),
    [universityId]
  )
  const { byKey, error } = useLiveLists<Exam>(specs)
  return { exams: universityId && byKey ? (byKey.get('all') ?? []) : null, error }
}

/** Notes de plusieurs examens (une requête par examen) : admin, enseignant. */
export function useGradesOfExams(universityId: string | null, examIds: string[] | null) {
  const specs = useMemo<Spec[]>(
    () =>
      universityId && examIds
        ? [...examIds].sort().map((id) => ({ key: id, path: tenantCollectionPath(universityId, 'grades'), child: 'examId', value: id }))
        : [],
    [universityId, examIds]
  )
  const { byKey, error } = useLiveLists<Grade>(specs)
  const ready = universityId !== null && examIds !== null
  return { gradesByExam: ready ? byKey : null, error }
}

/** Notes d'une fiche étudiant : l'étudiant, pour SA fiche seulement. */
export function useGradesOfStudent(universityId: string | null, studentId: string | null) {
  const specs = useMemo<Spec[]>(
    () =>
      universityId && studentId
        ? [{ key: 'mine', path: tenantCollectionPath(universityId, 'grades'), child: 'studentId', value: studentId }]
        : [],
    [universityId, studentId]
  )
  const { byKey, error } = useLiveLists<Grade>(specs)
  return { grades: universityId && studentId && byKey ? (byKey.get('mine') ?? []) : null, error }
}
