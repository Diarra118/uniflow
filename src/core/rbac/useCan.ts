import { useAuth } from '@/core/firebase/AuthContext'
import { can, type Action, type Resource } from './permissions'

/**
 * Garde UX à utiliser dans toute l'UI pour conditionner l'affichage ou
 * l'exécution d'une action selon le rôle courant. Ne remplace jamais les
 * Security Rules serveur, qui restent la garantie réelle.
 */
export function useCan(resource: Resource, action: Action): boolean {
  const { appUser } = useAuth()
  if (!appUser) return false
  return can(appUser.role, resource, action)
}
