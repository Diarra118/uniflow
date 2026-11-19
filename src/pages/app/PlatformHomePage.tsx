import { useMemo } from 'react'
import { BarChart3, Building2, CheckCircle2, ShieldCheck, SlidersHorizontal, Timer, PauseCircle, Info } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { platformUniversitiesIndexPath } from '@/core/firebase/paths'
import { ROLE_LABELS } from '@/shared/config/roleLabels'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import { countLabel } from '@/shared/utils/plural'
import { useRows } from '@/modules/dashboard/useDashboardData'
import {
  ComingSoonCard,
  DashboardHeader,
  Panel,
  PanelEmpty,
  PanelError,
  PanelSkeleton,
  StatCard,
  StatGrid,
} from '@/modules/dashboard/DashboardUI'
import {
  PLAN_LABELS,
  UNIVERSITY_STATUS_LABELS,
  UNIVERSITY_STATUS_TONE,
  type UniversityIndexEntry,
} from '@/modules/dashboard/platformLabels'

/** Espace du super admin plateforme : uniquement l'index commercial des
 * universités (platform/universitiesIndex, seule lecture ouverte à ce
 * rôle) — jamais de donnée pédagogique. */
export function PlatformHomePage() {
  const { appUser } = useAuth()
  useDocumentTitle('Espace plateforme')
  const index = useRows<Omit<UniversityIndexEntry, 'id'> & { id: string }>(
    appUser ? platformUniversitiesIndexPath() : null
  )
  const rows = useMemo(
    () => (index.data ? [...index.data].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr')) : null),
    [index.data]
  )
  if (!appUser) return null

  const count = (status: UniversityIndexEntry['status']) => rows?.filter((r) => r.status === status).length ?? null
  const plans = rows
    ? (['enterprise', 'premium', 'standard'] as const)
        .map((p) => ({ p, n: rows.filter((r) => r.plan === p).length }))
        .filter((x) => x.n > 0)
        .map((x) => `${x.n} ${PLAN_LABELS[x.p]}`)
        .join(' · ') || undefined
    : undefined
  const paused = rows ? rows.filter((r) => r.status === 'suspended' || r.status === 'archived').length : null

  return (
    <div className="dash mx-auto w-full max-w-6xl" data-dashboard="platform">
      <DashboardHeader eyebrow={ROLE_LABELS[appUser.role]} firstName={appUser.name.split(' ')[0]} />

      <StatGrid>
        <StatCard id="universities" index={0} icon={Building2} label="Universités clientes" value={rows?.length ?? null} hint={plans} />
        <StatCard
          id="universities-active"
          index={1}
          icon={CheckCircle2}
          label="Actives"
          value={count('active')}
          hint={rows && countLabel(count('trial') ?? 0, "en période d'essai", "en période d'essai")}
        />
        <StatCard id="universities-paused" index={2} icon={PauseCircle} label="Suspendues ou archivées" value={paused} hint={paused === 0 ? 'Aucun contrat interrompu' : undefined} />
      </StatGrid>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel id="universities-list" index={3} icon={Building2} title="Universités clientes" className="md:col-span-2">
          {index.error ? (
            <PanelError what="la liste des universités" />
          ) : !rows ? (
            <PanelSkeleton rows={3} />
          ) : rows.length === 0 ? (
            <PanelEmpty icon={Building2} title="Aucune université cliente">
              Les universités apparaîtront ici dès leur création.
            </PanelEmpty>
          ) : (
            <ul className="-mx-2 divide-y divide-base-300" data-testid="universities">
              {rows.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-base-content/70">
                      Offre {PLAN_LABELS[u.plan] ?? u.plan}
                    </span>
                  </span>
                  <StatusBadge tone={UNIVERSITY_STATUS_TONE[u.status] ?? 'neutral'}>
                    {UNIVERSITY_STATUS_LABELS[u.status] ?? u.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="platform-scope" index={4} icon={ShieldCheck} title="Périmètre de cet espace">
          <p className="text-sm leading-relaxed text-base-content/80">
            Vous voyez ici les seules métadonnées commerciales des universités : nom, offre et
            statut. Aucune donnée pédagogique (étudiants, enseignants, notes) n'est accessible
            depuis cet espace, même en lecture.
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs text-base-content/70">
            <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            Chaque université gère ses propres données, isolées des autres.
          </p>
        </Panel>

        <ComingSoonCard
          index={5}
          wide
          className="md:col-span-2 xl:col-span-3"
          items={[
            { icon: Building2, label: 'Création des universités', detail: "Ouverture d'un nouvel établissement client." },
            { icon: SlidersHorizontal, label: 'Offres et quotas', detail: "Changement d'offre, nombre de comptes autorisés." },
            { icon: Timer, label: 'Suspension et archivage', detail: 'Gestion du cycle de vie des contrats.' },
            { icon: BarChart3, label: "Indicateurs d'usage", detail: 'Comptes ouverts par université.' },
          ]}
        />
      </div>
    </div>
  )
}
