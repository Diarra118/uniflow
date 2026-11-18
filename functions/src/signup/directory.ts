import { onCall } from 'firebase-functions/v2/https'
import { onValueWritten } from 'firebase-functions/v2/database'
import { ACCOUNT_CALLABLE_OPTIONS } from '../auth/createUserAccount'
import { adminDeps } from '../auth/adminDeps'
import { databaseTriggerRegion } from '../auth/triggerRegion'
import { listSignupUniversitiesCore, syncUniversityIndexCore } from './directoryCore'

/** Liste publique des universités ouvertes aux inscriptions (id + nom).
 * Appelable sans connexion ; App Check exigé hors émulateur. */
export const listSignupUniversities = onCall(ACCOUNT_CALLABLE_OPTIONS, async () => ({
  universities: await listSignupUniversitiesCore(adminDeps()),
}))

/** Tient platform/universitiesIndex à jour à partir de universities/{id}/meta. */
export const onUniversityMetaWritten = onValueWritten(
  { ref: '/universities/{universityId}/meta', region: databaseTriggerRegion() },
  async (event) => {
    await syncUniversityIndexCore(adminDeps(), event.params.universityId as string)
  }
)
