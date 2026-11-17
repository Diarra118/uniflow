import type { ReactNode } from 'react'
import type { StatusTone } from '@/shared/utils/statusTone'

/** Badge de statut — style unique pour toute l'application (voir
 * `.status-badge` dans index.css et les tons dans utils/statusTone.ts). */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`status-badge status-badge-${tone}`}>{children}</span>
}
