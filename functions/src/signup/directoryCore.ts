import type { AccountDeps } from '../auth/accountShared'
import { UNIVERSITY_ID_RE } from '../auth/accountShared'
import {
  UNIVERSITY_INDEX_PATH,
  asObject,
  isOpenUniversityStatus,
  universityIndexPath,
} from './signupShared'

type DbDeps = Pick<AccountDeps, 'db'>

export interface PublicUniversity {
  id: string
  name: string
}

/**
 * Liste publique (page d'inscription, sans connexion) : identifiant et nom
 * des universités ouvertes aux inscriptions, triés par nom. Rien d'autre ne
 * sort : ni offre, ni statut, ni propriétaire, ni quotas. L'identifiant est
 * nécessaire pour désigner l'université dans la demande.
 */
export async function listSignupUniversitiesCore(deps: DbDeps): Promise<PublicUniversity[]> {
  const index = asObject(await deps.db.get(UNIVERSITY_INDEX_PATH)) ?? {}
  const list: PublicUniversity[] = []
  for (const [id, raw] of Object.entries(index)) {
    const entry = asObject(raw)
    if (!entry || !UNIVERSITY_ID_RE.test(id)) continue
    if (!isOpenUniversityStatus(entry.status)) continue
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name) continue
    list.push({ id, name: name.slice(0, 160) })
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/**
 * Déclencheur onUniversityMetaWritten : recopie { name, plan, status } de
 * universities/{id}/meta dans platform/universitiesIndex/{id} (lu par le
 * super admin et par listSignupUniversities). Relit l'état courant plutôt
 * que de se fier à l'événement (même principe que syncClaimsCore).
 */
export async function syncUniversityIndexCore(deps: DbDeps, universityId: string): Promise<'set' | 'removed' | 'skipped'> {
  if (!UNIVERSITY_ID_RE.test(universityId)) return 'skipped'
  const meta = asObject(await deps.db.get(`universities/${universityId}/meta`))
  if (!meta) {
    await deps.db.remove(universityIndexPath(universityId))
    return 'removed'
  }
  await deps.db.set(universityIndexPath(universityId), {
    name: typeof meta.name === 'string' ? meta.name : universityId,
    plan: typeof meta.plan === 'string' ? meta.plan : 'standard',
    status: typeof meta.status === 'string' ? meta.status : 'active',
  })
  return 'set'
}
