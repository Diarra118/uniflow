import { useEffect, useState } from 'react'
import { equalTo, onValue, orderByChild, query, ref } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath } from '@/core/firebase/paths'
import type { SignupRequest } from '@/core/types'

/** Ordre d'affichage : en attente d'abord, puis les plus récentes. */
const STATUS_ORDER: Record<string, number> = { pending: 0, processing: 1, approved: 2, rejected: 3 }

/** Demandes d'inscription de l'université (lecture réservée à son admin). */
export function useSignupRequests(universityId: string | null) {
  const [requests, setRequests] = useState<SignupRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!universityId) return
    return onValue(
      ref(rtdb, tenantCollectionPath(universityId, 'signupRequests')),
      (snap) => {
        const rows: SignupRequest[] = []
        snap.forEach((child) => {
          rows.push({ ...child.val(), uid: child.key as string })
        })
        rows.sort(
          (a, b) =>
            (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || b.createdAt - a.createdAt
        )
        setRequests(rows)
        setError(null)
        setLoading(false)
      },
      () => {
        setError('Impossible de charger les demandes.')
        setLoading(false)
      }
    )
  }, [universityId])

  return { requests, loading, error }
}

/** Nombre de demandes en attente (compteur de la barre latérale). null si
 * l'utilisateur n'y a pas accès. */
export function usePendingSignupCount(universityId: string | null) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!universityId) return
    const q = query(
      ref(rtdb, tenantCollectionPath(universityId, 'signupRequests')),
      orderByChild('status'),
      equalTo('pending')
    )
    return onValue(
      q,
      (snap) => setCount(snap.size),
      () => setCount(null)
    )
  }, [universityId])

  return count
}
