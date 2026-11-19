import { Sparkles } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { ROLE_LABELS } from '@/shared/config/roleLabels'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import { AdminDashboard } from '@/modules/dashboard/AdminDashboard'

/** Tableau de bord : une vue par rôle, chacune ne lisant que les données
 * que les règles ouvrent à ce rôle (le super admin a son propre espace,
 * /app/plateforme). */
export function DashboardPage() {
  const { appUser, university } = useAuth()
  useDocumentTitle('Tableau de bord')
  if (!appUser) return null

  if (appUser.role === 'admin_universite') return <AdminDashboard />

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-base-content/65">{ROLE_LABELS[appUser.role]}</p>
      <h1 className="font-display text-2xl font-semibold">Bonjour, {appUser.name.split(' ')[0]}</h1>
      {university && <p className="mt-1 text-sm text-base-content/70">{university.name}</p>}
      <div className="mt-8 flex items-start gap-4 rounded-box border border-base-300 bg-base-100 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          <Sparkles size={18} />
        </div>
        <div>
          <h2 className="font-display text-sm font-semibold">Fondations en place</h2>
          <p className="mt-1 text-sm text-base-content/70">
            L'authentification, les permissions et le cloisonnement entre universités sont
            opérationnels.
            Les modules métier (étudiants, notes, paiements, e-learning...) seront activés au
            fil des prochaines phases de développement.
          </p>
        </div>
      </div>
    </div>
  )
}
