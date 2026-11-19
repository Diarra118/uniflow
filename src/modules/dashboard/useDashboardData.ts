import { useEffect, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, type TenantSubcollection } from '@/core/firebase/paths'

export interface LiveValue<T> {
  /** null tant que la première lecture n'est pas arrivée. */
  data: T | null
  error: boolean
}

/**
 * Abonnement en lecture à un chemin RTDB. `path` à null : aucune lecture
 * (le rôle n'y a pas droit ou l'identifiant manque) — l'appelant ne doit
 * passer un chemin QUE pour une donnée que les règles ouvrent à ce rôle.
 */
function useLivePath<T>(path: string | null, map: (val: unknown) => T): LiveValue<T> {
  // État rattaché au chemin lu : un changement de chemin repart de « en
  // chargement » sans remise à zéro synchrone dans l'effet.
  const [state, setState] = useState<LiveValue<T> & { path: string | null }>({
    path: null,
    data: null,
    error: false,
  })

  useEffect(() => {
    if (!path) return
    return onValue(
      ref(rtdb, path),
      (snap) => setState({ path, data: map(snap.val()), error: false }),
      () => setState({ path, data: null, error: true })
    )
    // `map` : fonction définie au niveau du module, donc stable.
  }, [path, map])

  return state.path === path && path ? { data: state.data, error: state.error } : { data: null, error: false }
}

/** Nœud { id: valeur } → tableau d'objets portant leur `id`. */
function toRows<T>(val: unknown): T[] {
  if (!val || typeof val !== 'object') return []
  return Object.entries(val as Record<string, object>).map(([id, v]) => ({ ...v, id }) as T)
}
const asNode = <T,>(val: unknown) => (val ?? null) as T | null

/** Collection complète d'un tenant (lecture seule). */
export function useTenantRows<T>(universityId: string | null, sub: TenantSubcollection) {
  return useLivePath<T[]>(universityId ? tenantCollectionPath(universityId, sub) : null, toRows)
}

/** Un nœud quelconque (fiche, liens parent, index plateforme). */
export function useNode<T>(path: string | null) {
  return useLivePath<T | null>(path, asNode)
}

/** Nœud { id: valeur } quelconque, en tableau. */
export function useRows<T>(path: string | null) {
  return useLivePath<T[]>(path, toRows)
}
