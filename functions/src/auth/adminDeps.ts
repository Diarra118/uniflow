import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions/v2'
import { defineString } from 'firebase-functions/params'
import type { AccountDeps } from './accountShared'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

/** Clé API web du projet (publique, celle de VITE_FIREBASE_API_KEY) :
 * renseignée au déploiement (functions/.env.<projet> ou invite de la CLI),
 * jamais dans le code. */
const WEB_API_KEY = defineString('WEB_API_KEY', {
  description: "Clé API web Firebase, utilisée pour l'envoi des invitations (accounts:sendOobCode).",
})
/** Page vers laquelle renvoie l'email après définition du mot de passe. */
const APP_LOGIN_URL = defineString('APP_LOGIN_URL', {
  description: "URL de la page de connexion de l'application (ex. https://votre-domaine/login).",
})

/**
 * Fait envoyer par Firebase Auth l'email « réinitialisation du mot de passe »
 * (modèle personnalisable dans la console, langue fr). Le lien est généré et
 * envoyé par Firebase : il ne transite ni par cette fonction ni par l'admin.
 * La clé passe dans l'en-tête X-Goog-Api-Key, jamais dans l'URL.
 *
 * Sous l'émulateur Functions (FUNCTIONS_EMULATOR=true), l'appel vise
 * TOUJOURS l'émulateur Auth : aucun email réel n'est envoyé et le lien est
 * consultable dans l'interface des émulateurs. Aucune clé réelle requise.
 */
function identityToolkitTarget(): { base: string; apiKey: string } {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
    if (!authEmulatorHost) {
      // Ne jamais retomber sur le service réel depuis l'émulateur.
      throw Object.assign(new Error('Émulateur Auth non démarré'), {
        code: 'emulator/auth-emulator-missing',
      })
    }
    return {
      base: `http://${authEmulatorHost}/identitytoolkit.googleapis.com`,
      apiKey: 'emulator-fake-api-key',
    }
  }
  return { base: 'https://identitytoolkit.googleapis.com', apiKey: WEB_API_KEY.value() }
}

async function sendPasswordSetupEmail(email: string) {
  const { base, apiKey } = identityToolkitTarget()
  const res = await fetch(`${base}/v1/accounts:sendOobCode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Firebase-Locale': 'fr',
    },
    body: JSON.stringify({
      requestType: 'PASSWORD_RESET',
      email,
      continueUrl: APP_LOGIN_URL.value(),
    }),
  })
  if (!res.ok) {
    // Ex. EMAIL_NOT_FOUND, INVALID_CONTINUE_URI, RESET_PASSWORD_EXCEED_LIMIT :
    // seul ce code court est conservé (pas de corps, pas d'URL).
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null
    const reason =
      typeof body?.error?.message === 'string'
        ? body.error.message.split(/[\s:]/)[0]
        : `HTTP_${res.status}`
    throw Object.assign(new Error('sendOobCode a échoué'), { code: `identitytoolkit/${reason}` })
  }
}

/** Implémentation Admin SDK des dépendances injectées dans les cores. */
export function adminDeps(): AccountDeps {
  const auth = admin.auth()
  const db = admin.database()
  return {
    auth: {
      createUser: (props) => auth.createUser(props),
      updateUser: async (uid, props) => {
        await auth.updateUser(uid, props)
      },
      setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
      deleteUser: (uid) => auth.deleteUser(uid),
    },
    invitations: { sendPasswordSetupEmail },
    db: {
      get: async (path) => (await db.ref(path).get()).val(),
      set: (path, value) => db.ref(path).set(value),
      update: (path, values) => db.ref(path).update(values),
      remove: (path) => db.ref(path).remove(),
      transaction: async (path, update) => {
        const res = await db.ref(path).transaction(update)
        return { committed: res.committed, value: res.snapshot.val() }
      },
    },
    logger: {
      info: (message, data) => logger.info(message, data),
      error: (message, data) => logger.error(message, data),
    },
    now: () => Date.now(),
  }
}
