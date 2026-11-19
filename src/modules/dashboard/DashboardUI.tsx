import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, ArrowRight, Building2, CalendarDays, Clock } from 'lucide-react'
import type { EnrollmentStatus } from '@/core/types'
import { ENROLLMENT_STATUS_TONE } from '@/modules/students/schema'
import { countLabel } from '@/shared/utils/plural'
import { ENROLLMENT_ORDER } from './stats'
import { formatPercent, frenchToday } from './format'

/** Délai d'apparition échelonné (désactivé si l'utilisateur réduit les animations). */
const reveal = (i: number) => ({ className: 'dash-reveal', style: { animationDelay: `${i * 40}ms` } })

export function DashboardHeader({
  eyebrow,
  firstName,
  universityName,
  children,
}: {
  eyebrow: string
  firstName: string
  universityName?: string | null
  children?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm text-base-content/70">{eyebrow}</p>
        <h1 className="font-display text-2xl font-semibold sm:text-[28px]">Bonjour, {firstName}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-base-content/70">
          {universityName && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={15} aria-hidden="true" />
              {universityName}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5" data-testid="dashboard-date">
            <CalendarDays size={15} aria-hidden="true" />
            {frenchToday()}
          </span>
        </p>
      </div>
      {children}
    </header>
  )
}

/** Grille des cartes chiffrées : 1 colonne (mobile), 2 (tablette), 3 (grand écran). */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

export function StatCard({
  id,
  index = 0,
  icon: Icon,
  label,
  value,
  hint,
  to,
  highlight,
}: {
  id: string
  index?: number
  icon: LucideIcon
  label: string
  /** null : chargement en cours (squelette). */
  value: number | null
  hint?: ReactNode
  to?: string
  /** Mise en avant (demandes à traiter) : fond teinté ET libellé explicite. */
  highlight?: ReactNode
}) {
  const body = (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          highlight ? 'dash-icon-warning' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon size={19} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-base-content/75">
          <span className="truncate">{label}</span>
          {highlight}
        </p>
        {value === null ? (
          <div className="skeleton mt-2 h-7 w-14" />
        ) : (
          <p className="dash-number mt-0.5 font-display text-[28px] font-semibold leading-tight" data-stat-value>
            {value}
          </p>
        )}
        {hint && <p className="mt-0.5 truncate text-xs text-base-content/70">{hint}</p>}
      </div>
      {to && (
        <ArrowRight
          size={16}
          aria-hidden="true"
          className="mt-1 shrink-0 text-base-content/40 transition-transform group-hover:translate-x-0.5 group-hover:text-base-content/70"
        />
      )}
    </>
  )
  const cls = `group flex items-start gap-4 rounded-box border bg-base-100 p-4 transition-colors ${
    highlight ? 'dash-highlight' : 'border-base-300'
  } ${to ? 'hover:border-base-content/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' : ''}`
  const { className, style } = reveal(index)
  return to ? (
    <Link to={to} data-stat={id} className={`${cls} ${className}`} style={style}>
      {body}
    </Link>
  ) : (
    <div data-stat={id} className={`${cls} ${className}`} style={style}>
      {body}
    </div>
  )
}

/** Carte de contenu : en-tête (icône, titre, complément), corps, lien de pied. */
export function Panel({
  id,
  index = 0,
  icon: Icon,
  title,
  aside,
  footer,
  className = '',
  children,
}: {
  id: string
  index?: number
  icon: LucideIcon
  title: string
  aside?: ReactNode
  footer?: { to: string; label: string }
  className?: string
  children: ReactNode
}) {
  const r = reveal(index)
  return (
    <section
      data-card={id}
      aria-labelledby={`card-${id}`}
      className={`flex flex-col rounded-box border border-base-300 bg-base-100 ${r.className} ${className}`}
      style={r.style}
    >
      <div className="flex items-center gap-3 border-b border-base-300 px-5 py-3.5">
        <Icon size={17} aria-hidden="true" className="shrink-0 text-primary" />
        <h2 id={`card-${id}`} className="font-display text-[15px] font-semibold">
          {title}
        </h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
      {footer && (
        <div className="border-t border-base-300 px-5 py-3">
          <Link
            to={footer.to}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {footer.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  )
}

/** Lignes fantômes pendant le chargement d'une carte. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-2/3" />
            <div className="skeleton h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PanelError({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-error" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />
      Impossible de charger {what}.
    </p>
  )
}

/** État vide sobre à l'intérieur d'une carte. */
export function PanelEmpty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-2 py-6 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-base-200">
        <Icon size={18} aria-hidden="true" className="text-base-content/50" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {children && <p className="mt-1 max-w-xs text-sm text-base-content/70">{children}</p>}
    </div>
  )
}

const DIST_LABELS: Record<EnrollmentStatus, [string, string]> = {
  enrolled: ['inscrit', 'inscrits'],
  pending: ['en attente', 'en attente'],
  withdrawn: ['retiré', 'retirés'],
  graduated: ['diplômé', 'diplômés'],
}

/**
 * Répartition des étudiants par statut : anneau SVG + légende écrite
 * (nombre et pourcentage en toutes lettres : la couleur n'est jamais seule
 * porteuse de l'information).
 */
export function StatusDistribution({ counts }: { counts: Record<EnrollmentStatus, number> }) {
  const total = ENROLLMENT_ORDER.reduce((s, k) => s + counts[k], 0)
  const present = ENROLLMENT_ORDER.filter((k) => counts[k] > 0)
  const gap = present.length > 1 ? 1.2 : 0
  const share = (k: EnrollmentStatus) => (counts[k] / total) * 100
  const arcs = present.map((k, i) => ({
    k,
    dash: Math.max(share(k) - gap, 0.5),
    offset: present.slice(0, i).reduce((sum, x) => sum + share(x), 0),
  }))
  const summary = ENROLLMENT_ORDER.map((k) => countLabel(counts[k], ...DIST_LABELS[k])).join(', ')

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" role="img" aria-label={`Répartition des étudiants : ${summary}`}>
          <circle cx="18" cy="18" r="15.9155" fill="none" strokeWidth="3.6" className="dash-ring-track" />
          {arcs.map((a) => (
            <circle
              key={a.k}
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              strokeWidth="3.6"
              strokeDasharray={`${a.dash} ${100 - a.dash}`}
              strokeDashoffset={-a.offset}
              className={`dash-tone-${ENROLLMENT_STATUS_TONE[a.k]}`}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className="dash-number font-display text-2xl font-semibold leading-none">{total}</span>
          <span className="mt-1 text-xs text-base-content/70">{total <= 1 ? 'étudiant' : 'étudiants'}</span>
        </div>
      </div>
      <ul className="w-full space-y-2" data-testid="status-legend">
        {ENROLLMENT_ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2.5 text-sm" data-status={k} data-count={counts[k]}>
            <span className={`dash-dot dash-tone-${ENROLLMENT_STATUS_TONE[k]}`} aria-hidden="true" />
            <span className="flex-1">{countLabel(counts[k], ...DIST_LABELS[k])}</span>
            <span className="dash-number text-base-content/70">{formatPercent(total ? counts[k] / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Modules à venir : carte discrète, sans lien ni donnée. */
export function ComingSoonCard({
  index = 0,
  items,
}: {
  index?: number
  items: { icon: LucideIcon; label: string; detail: string }[]
}) {
  return (
    <Panel id="coming-soon" index={index} icon={Clock} title="Bientôt disponible">
      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.label} className="flex items-start gap-3">
            <m.icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-base-content/50" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-base-content/85">{m.label}</p>
              <p className="text-xs text-base-content/70">{m.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
