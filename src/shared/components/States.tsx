import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox } from 'lucide-react'

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-box border border-dashed border-base-300 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-base-200">
        <Icon size={22} className="text-base-content/40" />
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-base-content/70">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'Une erreur est survenue',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-box border border-error/30 bg-error/5 px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
        <AlertTriangle size={22} className="text-error" />
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-base-content/70">{description}</p>
      )}
      {onRetry && (
        <button className="btn btn-sm btn-outline btn-error mt-5" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-box border border-base-300">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div className="skeleton h-3 w-full max-w-32" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Indicateur discret dans la zone de contenu (la barre latérale et la
 * barre du haut restent affichées). */
export function ContentLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-base-content/70">
      <span className="loading loading-spinner loading-sm text-primary" />
      {label}
    </div>
  )
}

/** Chargement avant l'affichage de l'application (authentification). */
export function FullPageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-base-200">
      <span className="loading loading-spinner loading-lg text-primary" />
    </div>
  )
}
