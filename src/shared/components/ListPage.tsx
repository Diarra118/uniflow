import type { ReactNode } from 'react'

/**
 * Gabarit commun des pages de liste : même conteneur, même alignement et
 * même en-tête partout. Sous-titre au format « N éléments — Université »
 * (voir listSubtitle).
 */
export function ListPage({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-base-content/70">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}

/** « 13 étudiants — Université Horizon ». `count` vient de countLabel. */
export function listSubtitle(count: string, universityName?: string | null): string {
  return universityName ? `${count} — ${universityName}` : count
}
