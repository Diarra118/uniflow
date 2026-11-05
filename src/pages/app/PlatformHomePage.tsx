import { Building2 } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { EmptyState } from '@/shared/components/States'

export function PlatformHomePage() {
  const { appUser } = useAuth()
  if (!appUser) return null

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-base-content/50">Administrateur plateforme</p>
      <h1 className="font-display text-2xl font-semibold">Espace plateforme</h1>
      <p className="mt-1 text-sm text-base-content/60">
        Gestion commerciale des universités clientes — aucune donnée pédagogique n'est
        jamais accessible depuis cet espace.
      </p>

      <div className="mt-8">
        <EmptyState
          icon={Building2}
          title="Gestion commerciale à venir"
          description="La création, le plan et le statut des universités clientes seront gérés ici à partir de la phase dédiée du plan de développement."
        />
      </div>
    </div>
  )
}
