import { useEffect, useMemo, useState } from 'react'
import { ref, query, orderByChild, startAt, endAt, limitToFirst, onValue } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { TeacherProfile } from '@/core/types'

const PAGE_SIZE = 25

export function useTeachers(universityId: string | null, searchTerm: string) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [teachers, setTeachers] = useState<TeacherProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const normalizedSearch = searchTerm.trim().toLowerCase()

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [normalizedSearch])

  useEffect(() => {
    if (!universityId) {
      setTeachers([])
      setLoading(false)
      return
    }

    setLoading(true)
    const baseRef = ref(rtdb, tenantCollectionPath(universityId, 'teachers'))

    const q = normalizedSearch
      ? query(
          baseRef,
          orderByChild('searchKey'),
          startAt(normalizedSearch),
          endAt(normalizedSearch + '\uf8ff')
        )
      : query(baseRef, orderByChild('lastName'), limitToFirst(visibleCount))

    const unsubscribe = onValue(
      q,
      (snap) => {
        const rows: TeacherProfile[] = []
        snap.forEach((child) => {
          rows.push({ id: child.key as string, ...child.val() })
        })
        setTeachers(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError('Impossible de charger la liste des enseignants.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [universityId, visibleCount, normalizedSearch])

  const hasMore = !normalizedSearch && teachers.length === visibleCount

  return {
    teachers,
    loading,
    error,
    hasMore,
    isSearching: normalizedSearch.length > 0,
    loadMore: () => setVisibleCount((c) => c + PAGE_SIZE),
  }
}

export function useTeacher(universityId: string | null, teacherId: string | undefined) {
  const [teacher, setTeacher] = useState<TeacherProfile | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!universityId || !teacherId) return

    const nodeRef = ref(rtdb, `${tenantCollectionPath(universityId, 'teachers')}/${teacherId}`)
    const unsubscribe = onValue(
      nodeRef,
      (snap) => {
        setTeacher(snap.exists() ? ({ id: teacherId, ...snap.val() } as TeacherProfile) : null)
        setError(null)
      },
      () => setError("Impossible de charger le profil de l'enseignant.")
    )

    return unsubscribe
  }, [universityId, teacherId])

  return useMemo(
    () => ({ teacher, loading: teacher === undefined && !error, error }),
    [teacher, error]
  )
}

/** Liste complète des enseignants actifs — pour les listes déroulantes
 * d'association (ex : cours → enseignant). Volume attendu modeste par
 * tenant, chargement complet trié par nom sans pagination. */
export function useActiveTeachersList(universityId: string | null) {
  const [teachers, setTeachers] = useState<TeacherProfile[]>([])

  useEffect(() => {
    if (!universityId) {
      setTeachers([])
      return
    }
    const baseRef = ref(rtdb, tenantCollectionPath(universityId, 'teachers'))
    const q = query(baseRef, orderByChild('lastName'))
    const unsubscribe = onValue(q, (snap) => {
      const rows: TeacherProfile[] = []
      snap.forEach((child) => {
        rows.push({ id: child.key as string, ...child.val() })
      })
      setTeachers(rows.filter((t) => t.accountStatus === 'active'))
    })
    return unsubscribe
  }, [universityId])

  return teachers
}
