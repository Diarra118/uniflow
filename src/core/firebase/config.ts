import { initializeApp, getApps, getApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { EMULATOR_HOST, EMULATOR_PORTS, EMULATOR_PROJECT_ID, USE_EMULATORS } from './emulators'

/**
 * Configuration publique du SDK client Firebase — lue depuis les variables
 * d'environnement Vite (préfixe VITE_). Cette configuration n'est PAS un
 * secret au sens strict (voir FIREBASE_SECURITY.md) : la protection réelle
 * des données vient des Security Rules, pas de la confidentialité de ces
 * valeurs. Les véritables secrets (compte de service Admin SDK, clés IA)
 * ne transitent jamais par ce fichier ni par le bundle client.
 */
const firebaseConfig = USE_EMULATORS
  ? {
      // Configuration fictive : les émulateurs n'utilisent aucune clé réelle.
      apiKey: 'demo-api-key',
      authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
      // Namespace `<projectId>` : celui que lit l'émulateur Functions ; le seed
      // (npm run emulators:seed) y charge database.rules.json.
      databaseURL: `https://${EMULATOR_PROJECT_ID}.firebaseio.com`,
      projectId: EMULATOR_PROJECT_ID,
      storageBucket: `${EMULATOR_PROJECT_ID}.appspot.com`,
      appId: 'demo-app-id',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }

const requiredFirebaseKeys = ['apiKey', 'authDomain', 'projectId', 'databaseURL'] as const
const missingConfig = requiredFirebaseKeys.filter((key) => !firebaseConfig[key])

if (missingConfig.length > 0) {
  throw new Error(
    `Firebase configuration is incomplete. Missing: ${missingConfig.join(', ')}. Check .env.local or .env.`
  )
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

/**
 * App Check : exigé par les callables de gestion des accès
 * (enforceAppCheck). La clé de site reCAPTCHA Enterprise est publique.
 * Sans elle, ces appels sont refusés ; le reste de l'application fonctionne.
 * En local, VITE_FIREBASE_APPCHECK_DEBUG=true active le jeton de débogage
 * (à enregistrer dans la console : App Check > Applications > Jetons de débogage).
 * Désactivé en mode émulateurs (l'émulateur Functions ne l'exige pas).
 */
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
if (appCheckSiteKey && !USE_EMULATORS) {
  if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG === 'true') {
    ;(globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const rtdb = getDatabase(app)
export const storage = getStorage(app)

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`, {
    disableWarnings: true,
  })
  connectDatabaseEmulator(rtdb, EMULATOR_HOST, EMULATOR_PORTS.database)
  console.info(`[Firebase] Mode émulateurs (${EMULATOR_PROJECT_ID}) — aucune donnée réelle.`)
}

export default app
