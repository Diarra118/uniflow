import { useEffect, useMemo, useState } from 'react'
import { ref, query, orderByChild, startAt, endAt, limitToFirst, onValue } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { StudentProfile } from '@/core/types'

const PAGE_SIZE = 25

/**
 * Liste des étudiants du tenant courant, avec deux modes :
 * - par défaut : chargement progressif trié par nom (limitToFirst croissant,
 *   "Charger plus" agrandit la fenêtre) ;
 * - recherche active : requête RTDB par plage sur `searchKey`
 *   (orderByChild + startAt/endAt), qui couvre nom, prénom et matricule.
 *
 * Limite connue (documentée) : les filtres par statut sont appliqués côté
 * client sur la fenêtre chargée — RTDB ne permet pas de requêtes composées
 * (recherche + filtre + tri simultanés) sans dupliquer la donnée dans un
 * index dédié, hors périmètre de la Phase 2.
 */
export function useStudents(universityId: string | null, searchTerm: string) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [students, setStudents] = useState<StudentProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const normalizedSearch = searchTerm.trim().toLowerCase()

  // La recherche repart d'une fenêtre fraîche à chaque nouvelle frappe.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [normalizedSearch])

  useEffect(() => {
    if (!universityId) {
      setStudents([])
      setLoading(false)
      return
    }

    setLoading(true)
    const baseRef = ref(rtdb, tenantCollectionPath(universityId, 'students'))

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
        const rows: StudentProfile[] = []
        snap.forEach((child) => {
          rows.push({ id: child.key as string, ...child.val() })
        })
        // orderByChild trie par ordre croissant ; on garde cet ordre (nom A→Z).
        setStudents(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError('Impossible de charger la liste des étudiants.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [universityId, visibleCount, normalizedSearch])

  const hasMore = !normalizedSearch && students.length === visibleCount

  return {
    students,
    loading,
    error,
    hasMore,
    isSearching: normalizedSearch.length > 0,
    loadMore: () => setVisibleCount((c) => c + PAGE_SIZE),
  }
}

/** Un seul étudiant, pour la page de profil. */
export function useStudent(universityId: string | null, studentId: string | undefined) {
  const [student, setStudent] = useState<StudentProfile | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!universityId || !studentId) return

    const nodeRef = ref(rtdb, `${tenantCollectionPath(universityId, 'students')}/${studentId}`)
    const unsubscribe = onValue(
      nodeRef,
      (snap) => {
        setStudent(snap.exists() ? ({ id: studentId, ...snap.val() } as StudentProfile) : null)
        setError(null)
      },
      () => setError("Impossible de charger le profil de l'étudiant.")
    )

    return unsubscribe
  }, [universityId, studentId])

  return useMemo(
    () => ({ student, loading: student === undefined && !error, error }),
    [student, error]
  )
}
