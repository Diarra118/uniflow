import type { ReactNode } from 'react'

/**
 * Badge de statut — style unique pour toute l'application (voir
 * `.status-badge` dans index.css). Tons :
 * - success : actif, inscrit, accès créé (vert)
 * - warning : en attente (orange)
 * - neutral : inactif, retiré, pas d'accès (gris)
 * - info    : diplômé (bleu)
 */
export type StatusTone = 'success' | 'warning' | 'info' | 'neutral'

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`status-badge status-badge-${tone}`}>{children}</span>
}

/** Statuts actif / inactif (comptes, filières, classes). */
export function activeTone(active: boolean): StatusTone {
  return active ? 'success' : 'neutral'
}
