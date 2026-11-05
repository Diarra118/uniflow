import { useEffect, useState } from 'react'
import { ref, query, orderByChild, onValue } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { CourseUnit } from '@/core/types'

export function useCourses(universityId: string | null) {
  const [courses, setCourses] = useState<CourseUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!universityId) {
      setCourses([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(ref(rtdb, tenantCollectionPath(universityId, 'courses')), orderByChild('name'))

    const unsubscribe = onValue(
      q,
      (snap) => {
        const rows: CourseUnit[] = []
        snap.forEach((child) => {
          rows.push({ id: child.key as string, ...child.val() })
        })
        setCourses(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError('Impossible de charger la liste des cours.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [universityId])

  return { courses, loading, error }
}
