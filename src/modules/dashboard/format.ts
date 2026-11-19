/** « Mercredi 18 novembre 2026 ». */
export function frenchToday(now = new Date()): string {
  const s = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const percentFormat = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })
/** « 83 % » (espace insécable fine, à la française). */
export const formatPercent = (ratio: number) => percentFormat.format(ratio)

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
/** « 19 sept. 2026 ». */
export const formatShortDate = (ms: number) => shortDate.format(new Date(ms))

/** Initiales d'un nom, pour les pastilles d'avatar. */
export const initials = (firstName: string, lastName: string) =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
