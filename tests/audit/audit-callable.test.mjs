// Audit : attribution des claims par createUserAccount (émulateurs), avec les
// données placées dans le namespace réellement lu par l'émulateur Functions.
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
assert.ok(PID?.startsWith('demo-'))
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST
const NS = new URL(JSON.parse(process.env.FIREBASE_CONFIG).databaseURL).hostname.split('.')[0]
const TOOLKIT = `http://${AUTH}/identitytoolkit.googleapis.com/v1`
const FN = `http://127.0.0.1:5001/${PID}/europe-west1`
const pw = { admin: randomBytes(12).toString('base64url'), adminB: randomBytes(12).toString('base64url'), teacher: randomBytes(12).toString('base64url') }
let app

async function signIn(email, password) {
  const r = await fetch(`${TOOLKIT}/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  return (await r.json()).idToken
}
async function call(name, data, token) {
  const r = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  })
  return r.json()
}
async function mkUser(uid, email, password, claims, universityId, role) {
  await app.auth().createUser({ uid, email, password })
  await app.auth().setCustomUserClaims(uid, claims)
  await app.database().ref(`users/${uid}`).set({ uid, email, role, universityId, status: 'active', name: uid })
}

before(async () => {
  app = admin.initializeApp({ projectId: PID, databaseURL: `https://${NS}.firebaseio.com` }, 'c')
  const db = app.database()
  await db.ref('universities').set({
    A: {
      meta: { name: 'A', plan: 'standard', status: 'active' },
      students: { s1: { firstName: 'Awa', lastName: 'Diallo', email: 'awa@a.test' } },
      teachers: { t1: { firstName: 'Moussa', lastName: 'T', email: 'moussa@a.test' } },
    },
    B: {
      meta: { name: 'B', plan: 'standard', status: 'suspended' },
      students: { b1: { firstName: 'Bob', lastName: 'B', email: 'bob@b.test' } },
    },
  })
  await mkUser('adminA', 'admin@a.test', pw.admin, { role: 'admin_universite', universityId: 'A' }, 'A', 'admin_universite')
  await mkUser('adminB', 'admin@b.test', pw.adminB, { role: 'admin_universite', universityId: 'B' }, 'B', 'admin_universite')
  await mkUser('teacherA', 'prof@a.test', pw.teacher, { role: 'teacher', universityId: 'A' }, 'A', 'teacher')
})
after(async () => app.delete())

test('admin A : createUserAccount → compte, claims serveur, fiche liée, invitation (émulateur Auth)', async () => {
  const res = await call('createUserAccount', { role: 'student', linkedRecordType: 'student', linkedRecordId: 's1' }, await signIn('admin@a.test', pw.admin))
  assert.equal(res.error, undefined, JSON.stringify(res.error))
  const uid = res.result.uid
  const user = await app.auth().getUser(uid)
  assert.deepEqual(user.customClaims, { role: 'student', universityId: 'A' })
  assert.equal(user.displayName, 'Awa Diallo')
  assert.equal((await app.database().ref('universities/A/students/s1/uid').get()).val(), uid)
  assert.equal((await app.database().ref(`users/${uid}/status`).get()).val(), 'active')
  const codes = await (await fetch(`http://${AUTH}/emulator/v1/projects/${PID}/oobCodes`)).json()
  assert.ok(codes.oobCodes.some((c) => c.email === 'awa@a.test' && c.requestType === 'PASSWORD_RESET'), 'lien généré (non affiché)')
})

test('entrée forgée : universityId / rôle admin / email injectés → refus', async () => {
  const t = await signIn('admin@a.test', pw.admin)
  for (const data of [
    { role: 'student', linkedRecordType: 'student', linkedRecordId: 's1', universityId: 'B' },
    { role: 'admin_universite', linkedRecordType: 'student', linkedRecordId: 's1' },
    { role: 'teacher', linkedRecordType: 'teacher', linkedRecordId: 't1', email: 'pirate@x.test' },
  ]) {
    const res = await call('createUserAccount', data, t)
    assert.equal(res.error?.status, 'INVALID_ARGUMENT', JSON.stringify(data))
  }
})

test('enseignant → PERMISSION_DENIED ; fiche de B → NOT_FOUND ; université suspendue → PERMISSION_DENIED', async () => {
  const rt = await call('createUserAccount', { role: 'teacher', linkedRecordType: 'teacher', linkedRecordId: 't1' }, await signIn('prof@a.test', pw.teacher))
  assert.equal(rt.error?.status, 'PERMISSION_DENIED')
  const rb = await call('createUserAccount', { role: 'student', linkedRecordType: 'student', linkedRecordId: 'b1' }, await signIn('admin@a.test', pw.admin))
  assert.equal(rb.error?.status, 'NOT_FOUND')
  const rs = await call('createUserAccount', { role: 'student', linkedRecordType: 'student', linkedRecordId: 'b1' }, await signIn('admin@b.test', pw.adminB))
  assert.equal(rs.error?.status, 'PERMISSION_DENIED')
  assert.equal((await app.database().ref('universities/B/students/b1/uid').get()).val(), null)
})
