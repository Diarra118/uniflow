/**
 * Tons des badges de statut (StatusBadge) :
 * - success : actif, inscrit, accès créé (vert)
 * - warning : en attente (orange)
 * - neutral : inactif, retiré, pas d'accès (gris)
 * - info    : diplômé (bleu)
 */
export type StatusTone = 'success' | 'warning' | 'info' | 'neutral'

/** Statuts actif / inactif (comptes, filières, classes). */
export function activeTone(active: boolean): StatusTone {
  return active ? 'success' : 'neutral'
}
