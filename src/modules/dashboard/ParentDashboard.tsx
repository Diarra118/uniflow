import { Bell, ClipboardCheck, CreditCard, FileText, HeartHandshake, Users } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { ROLE_LABELS } from '@/shared/config/roleLabels'
import { parentLinksPath } from '@/core/firebase/paths'
import { countLabel } from '@/shared/utils/plural'
import type { ParentLink } from '@/core/types'
import { useRows } from './useDashboardData'
import { ComingSoonCard, DashboardHeader, Panel, PanelError, PanelSkeleton } from './DashboardUI'

/** Accueil parent : aucune donnée pédagogique n'est encore ouverte à ce
 * rôle. Seule lecture : SES liens parent-enfant (parentLinks/{uid}), pour
 * dire combien d'enfants sont rattachés — jamais leur fiche. */
export function ParentDashboard() {
  const { appUser, university } = useAuth()
  const links = useRows<ParentLink>(
    appUser?.universityId ? parentLinksPath(appUser.universityId, appUser.uid) : null
  )
  if (!appUser) return null

  const children = links.data?.filter((l) => l.authorized === true).length ?? null

  return (
    <div className="dash mx-auto w-full max-w-6xl" data-dashboard="parent">
      <DashboardHeader
        eyebrow={ROLE_LABELS[appUser.role]}
        firstName={appUser.name.split(' ')[0]}
        universityName={university?.name}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel id="parent-welcome" index={0} icon={HeartHandshake} title="Votre espace parent" className="md:col-span-2">
          <p className="text-sm leading-relaxed text-base-content/80">
            Cet espace vous permettra de suivre la scolarité de vos enfants : leurs notes, les
            paiements des frais de scolarité, leurs documents officiels et les messages de
            l'administration.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-base-content/80">
            Ces informations s'afficheront ici au fur et à mesure de l'ouverture des modules.
            L'accès à chaque enfant est accordé par l'administration de l'université.
          </p>
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-base-200 px-4 py-3" data-testid="parent-children">
            <Users size={18} aria-hidden="true" className="shrink-0 text-primary" />
            {links.error ? (
              <PanelError what="vos rattachements" />
            ) : children === null ? (
              <PanelSkeleton rows={1} />
            ) : children === 0 ? (
              <p className="text-sm">
                Aucun enfant n'est encore rattaché à votre compte. Contactez l'administration de
                l'université.
              </p>
            ) : (
              <p className="text-sm">
                <span className="dash-number font-semibold">{countLabel(children, 'enfant', 'enfants')}</span>{' '}
                {children === 1 ? 'rattaché' : 'rattachés'} à votre compte.
              </p>
            )}
          </div>
        </Panel>

        <ComingSoonCard
          index={1}
          items={[
            { icon: ClipboardCheck, label: 'Notes', detail: 'Les résultats de vos enfants, cours par cours.' },
            { icon: CreditCard, label: 'Paiements', detail: 'Frais de scolarité, échéances et reçus.' },
            { icon: FileText, label: 'Documents', detail: 'Attestations et relevés officiels.' },
            { icon: Bell, label: 'Notifications', detail: "Messages de l'administration." },
          ]}
        />
      </div>
    </div>
  )
}
