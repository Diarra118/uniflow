// Audit : attribution des custom claims (émulateurs Auth + Database + Functions).
// Projet demo-uniflow (aucune ressource réelle). Aucun mot de passe affiché.
// Lancer depuis la racine : npm run test:audit:server
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(`${PROJECT}/functions/package.json`)
const admin = require('firebase-admin')

const PID = process.env.GCLOUD_PROJECT
assert.ok(PID?.startsWith('demo-'), 'projet demo-* requis')
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST
const DBH = process.env.FIREBASE_DATABASE_EMULATOR_HOST
const TOOLKIT = `http://${AUTH}/identitytoolkit.googleapis.com/v1`
// Namespace utilisé par l'émulateur Functions (FIREBASE_CONFIG) vs namespace
// où l'émulateur charge database.rules.json (celui du frontend en mode émulateurs).
const NS_FUNCTIONS = new URL(JSON.parse(process.env.FIREBASE_CONFIG).databaseURL).hostname.split('.')[0]
const NS_RULES = `${PID}-default-rtdb`

let appF, appR
const pwd = () => randomBytes(12).toString('base64url')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitClaims(uid, predicate, timeoutMs) {
  const end = Date.now() + timeoutMs
  let claims
  while (Date.now() < end) {
    claims = (await appF.auth().getUser(uid)).customClaims ?? {}
    if (predicate(claims)) return claims
    await sleep(500)
  }
  return claims
}
async function signIn(email, password) {
  const r = await fetch(`${TOOLKIT}/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  return (await r.json()).idToken
}
async function newUser(uid, extra = {}) {
  const password = pwd()
  await appF.auth().createUser({ uid, email: `${uid}@audit.test`, password, ...extra })
  return password
}

before(async () => {
  console.log(`# namespace Functions = ${NS_FUNCTIONS} ; namespace règles = ${NS_RULES}`)
  appF = admin.initializeApp({ projectId: PID, databaseURL: `https://${NS_FUNCTIONS}.firebaseio.com` }, 'f')
  appR = admin.initializeApp({ projectId: PID, databaseURL: `https://${NS_RULES}.firebaseio.com` }, 'r')
})
after(async () => { await appF.delete(); await appR.delete() })

test('un client ne peut pas se poser lui-même des custom claims (Identity Toolkit accounts:update)', async () => {
  const password = await newUser('client1')
  const idToken = await signIn('client1@audit.test', password)
  const r = await fetch(`${TOOLKIT}/accounts:update?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, customAttributes: JSON.stringify({ role: 'admin_universite', universityId: 'A' }) }),
  })
  const body = await r.json()
  console.log(`# accounts:update avec idToken -> HTTP ${r.status} ${body.error?.message ?? 'OK'}`)
  const claims = (await appF.auth().getUser('client1')).customClaims ?? {}
  assert.deepEqual(claims, {}, 'claims inchangés')
})

test('un client ne peut pas écrire son profil /users (règles, token réel de l’émulateur Auth)', async () => {
  const password = await newUser('client2')
  const idToken = await signIn('client2@audit.test', password)
  const r = await fetch(`http://${DBH}/users/client2.json?ns=${NS_RULES}&auth=${idToken}`, {
    method: 'PUT', body: JSON.stringify({ role: 'admin_universite', universityId: 'A', status: 'active' }),
  })
  assert.equal(r.status, 401)
  assert.equal((await appR.database().ref('users/client2').get()).val(), null)
})

// Le déclencheur onUserProfileWritten s'exécute sous l'émulateur : sa région y
// vaut us-central1 (seule région que l'émulateur Database déclenche), contre
// europe-west1 en production (functions/src/auth/triggerRegion.ts).

let trig1Password
test('serveur : écriture Admin SDK de /users (actif) → le déclencheur pose role + universityId', async () => {
  trig1Password = await newUser('trig1')
  await appF.database().ref('users/trig1').set({ role: 'teacher', universityId: 'A', status: 'active' })
  const claims = await waitClaims('trig1', (c) => c.role === 'teacher', 25000)
  assert.deepEqual(claims, { role: 'teacher', universityId: 'A' })
})

test('serveur : passage en suspended → claims vidés et sessions révoquées', async () => {
  const before = (await appF.auth().getUser('trig1')).tokensValidAfterTime
  // Session ouverte AVANT la suspension : son refresh token doit être refusé après.
  const session = await (await fetch(`${TOOLKIT}/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'trig1@audit.test', password: trig1Password, returnSecureToken: true }),
  })).json()
  assert.ok(session.refreshToken, 'session ouverte')
  await sleep(1100)
  await appF.database().ref('users/trig1/status').set('suspended')
  const claims = await waitClaims('trig1', (c) => !c.role, 25000)
  assert.deepEqual(claims, {})
  const afterT = (await appF.auth().getUser('trig1')).tokensValidAfterTime
  assert.notEqual(afterT, before, 'tokensValidAfterTime avancé (revokeRefreshTokens)')
  // Le token de la session d'avant la suspension est révoqué : refusé par
  // l'Admin SDK (contrôle de révocation) et par l'API Auth.
  await assert.rejects(appF.auth().verifyIdToken(session.idToken, true), { code: 'auth/id-token-revoked' })
  const lookup = await fetch(`${TOOLKIT}/accounts:lookup?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: session.idToken }),
  })
  assert.equal(lookup.status, 400)
  assert.equal((await lookup.json()).error?.message, 'TOKEN_EXPIRED')
  // Constat : l'émulateur Auth ne contrôle pas la révocation lors du
  // rafraîchissement (la production répond TOKEN_EXPIRED). Pas d'assertion.
  const refresh = await fetch(`http://${AUTH}/securetoken.googleapis.com/v1/token?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
  })
  const body = await refresh.json()
  console.log(`# refresh token d'avant la suspension (émulateur) -> HTTP ${refresh.status} ${body.error?.message ?? 'OK'}`)
})

test('serveur : status pending → aucun claim', async () => {
  await newUser('pend1')
  await appF.database().ref('users/pend1').set({ role: 'student', universityId: 'A', status: 'pending' })
  const claims = await waitClaims('pend1', (c) => !!c.role, 6000)
  assert.deepEqual(claims, {})
})

test('serveur : compte Auth désactivé → aucun claim', async () => {
  await newUser('dis1', { disabled: true })
  await appF.database().ref('users/dis1').set({ role: 'student', universityId: 'A', status: 'active' })
  const claims = await waitClaims('dis1', (c) => !!c.role, 6000)
  assert.deepEqual(claims, {})
})

test('constat émulateurs : un profil écrit dans le namespace des règles ne déclenche rien', async () => {
  await newUser('ns1')
  await appR.database().ref('users/ns1').set({ role: 'teacher', universityId: 'A', status: 'active' })
  const claims = await waitClaims('ns1', (c) => !!c.role, 8000)
  console.log(`# profil dans ${NS_RULES} -> claims ${JSON.stringify(claims)}`)
  // Pas d'assertion bloquante : on documente le comportement observé.
})
