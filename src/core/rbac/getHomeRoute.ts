import type { Role } from '@/core/types'

/**
 * Détermine la route d'accueil après connexion, selon le rôle. Le
 * super_admin_plateforme atterrit sur son espace dédié (métadonnées
 * commerciales), distinct du tableau de bord pédagogique des autres rôles.
 */
export function getHomeRoute(role: Role): string {
  if (role === 'super_admin_plateforme') return '/app/plateforme'
  return '/app'
}
