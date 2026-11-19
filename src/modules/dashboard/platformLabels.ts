import type { UniversityPlan, UniversityStatus } from '@/core/types'
import type { StatusTone } from '@/shared/utils/statusTone'

/** Entrée de platform/universitiesIndex (miroir commercial de meta). */
export interface UniversityIndexEntry {
  id: string
  name: string
  plan: UniversityPlan
  status: UniversityStatus
}

export const PLAN_LABELS: Record<UniversityPlan, string> = {
  standard: 'Standard',
  premium: 'Premium',
  enterprise: 'Entreprise',
}

export const UNIVERSITY_STATUS_LABELS: Record<UniversityStatus, string> = {
  active: 'Active',
  trial: "Période d'essai",
  suspended: 'Suspendue',
  archived: 'Archivée',
}

export const UNIVERSITY_STATUS_TONE: Record<UniversityStatus, StatusTone> = {
  active: 'success',
  trial: 'info',
  suspended: 'warning',
  archived: 'neutral',
}
