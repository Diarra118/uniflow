import { useEffect, useState } from 'react'
import { ref, query, orderByChild, onValue } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { ClassGroup } from '@/core/types'

/**
 * Comme pour les filières, le nombre de classes par université reste
 * structurellement modeste : chargement complet trié par nom, sans
 * pagination ni recherche.
 */
export function useClasses(universityId: string | null) {
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!universityId) {
      setClasses([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(ref(rtdb, tenantCollectionPath(universityId, 'classes')), orderByChild('name'))

    const unsubscribe = onValue(
      q,
      (snap) => {
        const rows: ClassGroup[] = []
        snap.forEach((child) => {
          rows.push({ id: child.key as string, ...child.val() })
        })
        setClasses(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError('Impossible de charger la liste des classes.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [universityId])

  return { classes, loading, error }
}
