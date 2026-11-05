import { useEffect, useState } from 'react'
import { ref, query, orderByChild, onValue } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { Program } from '@/core/types'

/**
 * Le nombre de filières par université est structurellement faible
 * (quelques dizaines au plus) : chargement complet trié par nom, sans
 * pagination — à la différence des étudiants/enseignants.
 */
export function usePrograms(universityId: string | null) {
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!universityId) {
      setPrograms([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(ref(rtdb, tenantCollectionPath(universityId, 'programs')), orderByChild('name'))

    const unsubscribe = onValue(
      q,
      (snap) => {
        const rows: Program[] = []
        snap.forEach((child) => {
          rows.push({ id: child.key as string, ...child.val() })
        })
        setPrograms(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError('Impossible de charger la liste des filières.')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [universityId])

  return { programs, loading, error }
}
