import * as admin from 'firebase-admin'
import { onValueWritten } from 'firebase-functions/v2/database'
import { logger } from 'firebase-functions/v2'
import { syncClaimsCore, type ClaimsDeps } from './syncClaimsCore'
import { profileTriggerRegion } from './triggerRegion'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

function claimsDeps(): ClaimsDeps {
  const auth = admin.auth()
  return {
    getProfile: async (uid) => (await admin.database().ref(`users/${uid}`).get()).val(),
    getUser: async (uid) => {
      try {
        const user = await auth.getUser(uid)
        return { disabled: user.disabled }
      } catch (err) {
        if ((err as { code?: string }).code === 'auth/user-not-found') return null
        throw err
      }
    },
    setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
    revokeRefreshTokens: (uid) => auth.revokeRefreshTokens(uid),
    logger: {
      info: (message) => logger.info(message),
      warn: (message) => logger.warn(message),
    },
  }
}

/**
 * Seule voie légitime pour attribuer role/universityId : le client ne peut
 * jamais écrire /users/{uid} (database.rules.json). Le noeud est écrit par
 * l'Admin SDK (createUserAccount, ou manuellement pour le premier
 * administrateur) ; ce déclencheur propage ces valeurs en custom claims, en
 * se fondant sur l'état courant du profil et du compte Auth (voir
 * syncClaimsCore.ts) : claims posés uniquement si status === "active" et
 * compte Auth actif ; suspension = claims vidés + sessions révoquées.
 *
 * Région : europe-west1 en production ; us-central1 sous l'émulateur
 * seulement, pour qu'il s'y déclenche (voir triggerRegion.ts).
 */
export const onUserProfileWritten = onValueWritten(
  { ref: '/users/{uid}', region: profileTriggerRegion() },
  async (event) => {
    await syncClaimsCore(claimsDeps(), event.params.uid as string, !event.data.after.exists())
  }
)
