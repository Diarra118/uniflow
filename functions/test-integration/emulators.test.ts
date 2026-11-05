/**
 * Tests d'intégration contre les émulateurs Auth + Database + Functions.
 * Lancer depuis la racine : `npm run test:integration`
 * (firebase emulators:exec, projet demo-uniflow — aucune ressource réelle).
 *
 * Les callables sont appelées en HTTP comme le ferait le SDK client, avec un
 * vrai ID token émis par l'émulateur Auth. Aucun lien ni mot de passe n'est
 * affiché.
 */
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  AUTH_EMULATOR,
  DATABASE_EMULATOR,
  NAMESPACE,
  PROJECT_ID,
  SEED,
  seedApp,
  seedEmulators,
} from '../scripts/seedEmulators'

const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/europe-west1`
// Namespace partagé avec l'émulateur Functions ; le seed y charge les règles.
const NS = NAMESPACE
const TOOLKIT = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`

const adminPassword = randomBytes(12).toString('base64url')
const teacherPassword = randomBytes(12).toString('base64url')

type CallResult = { result?: Record<string, unknown>; error?: { status: string; message: string } }

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${TOOLKIT}/accounts:signInWithPassword?key=emulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const body = (await res.json()) as { idToken?: string; error?: { message: string } }
  assert.ok(body.idToken, `connexion de ${email} impossible : ${body.error?.message}`)
  return body.idToken
}

async function call(name: string, data: unknown, idToken?: string): Promise<CallResult> {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ data }),
  })
  return (await res.json()) as CallResult
}

/** Liens générés par l'émulateur Auth (jamais affichés par les tests). */
async function oobCodes(email: string) {
  const res = await fetch(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/oobCodes`)
  const body = (await res.json()) as {
    oobCodes: Array<{ email: string; requestType: string; oobCode: string; oobLink: string }>
  }
  return body.oobCodes.filter((c) => c.email === email && c.requestType === 'PASSWORD_RESET')
}

/** Lecture RTDB REST avec l'ID token : soumise aux Security Rules. */
async function readAs(idToken: string, path: string) {
  const res = await fetch(`http://${DATABASE_EMULATOR}/${path}.json?ns=${NS}&auth=${idToken}`)
  return res.status
}

let studentUid = ''

before(async () => {
  await seedEmulators({ adminPassword })
  const app = seedApp()

  // Une autre université, avec une fiche, pour l'isolation multi-tenant.
  await app.database().ref('universities/universite-autre').set({
    meta: { name: 'Autre', slug: 'autre', plan: 'standard', status: 'active', createdAt: Date.now() },
    students: { x1: { firstName: 'Autre', lastName: 'Tenant', email: 'autre@autre.test' } },
  })

  // Un enseignant actif de l'université démo.
  await app.auth().createUser({ uid: 'demo-teacher', email: 'prof@universite-demo.test', password: teacherPassword })
  await app.auth().setCustomUserClaims('demo-teacher', { role: 'teacher', universityId: SEED.universityId })
  await app.database().ref('users/demo-teacher').set({
    uid: 'demo-teacher',
    email: 'prof@universite-demo.test',
    name: 'Prof',
    role: 'teacher',
    universityId: SEED.universityId,
    status: 'active',
    createdAt: Date.now(),
  })
})

after(async () => {
  await seedApp().delete()
})

test('admin du seed : createUserAccount crée le compte, pose les claims, lie la fiche, envoie l’invitation', async () => {
  const token = await signIn(SEED.admin.email, adminPassword)
  const res = await call(
    'createUserAccount',
    { role: 'student', linkedRecordType: 'student', linkedRecordId: SEED.studentId },
    token
  )
  assert.equal(res.error, undefined, JSON.stringify(res.error))
  assert.equal(res.result?.invitationSent, true)
  studentUid = String(res.result?.uid)
  assert.deepEqual(Object.keys(res.result!).sort(), ['invitationSent', 'uid'], 'aucun lien retourné')

  const app = seedApp()
  const user = await app.auth().getUser(studentUid)
  assert.equal(user.email, SEED.student.email)
  assert.equal(user.displayName, `${SEED.student.firstName} ${SEED.student.lastName}`)
  assert.equal(user.disabled, false)
  assert.deepEqual(user.customClaims, { role: 'student', universityId: SEED.universityId })

  const profile = (await app.database().ref(`users/${studentUid}`).get()).val()
  assert.equal(profile.status, 'active')
  assert.equal(profile.linkedRecordId, SEED.studentId)
  assert.equal(profile.universityId, SEED.universityId)

  const record = (await app.database().ref(`universities/${SEED.universityId}/students/${SEED.studentId}`).get()).val()
  assert.equal(record.uid, studentUid)
  assert.equal(record.firstName, SEED.student.firstName, 'fiche intacte')

  const codes = await oobCodes(SEED.student.email)
  assert.equal(codes.length, 1, 'un lien de définition du mot de passe généré')
  assert.ok(
    decodeURIComponent(codes[0].oobLink).includes('localhost:5173/login'),
    'continueUrl = APP_LOGIN_URL du projet demo'
  )
})

test('parcours étudiant : lien utilisé → connexion → règles (sa fiche seulement)', async () => {
  const [code] = await oobCodes(SEED.student.email)
  const newPassword = randomBytes(12).toString('base64url')
  const reset = await fetch(`${TOOLKIT}/accounts:resetPassword?key=emulator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code.oobCode, newPassword }),
  })
  assert.equal(reset.status, 200, 'lien d’invitation utilisable')

  const token = await signIn(SEED.student.email, newPassword)
  const u = SEED.universityId
  assert.equal(await readAs(token, `users/${studentUid}`), 200, 'lit son profil')
  assert.equal(await readAs(token, `universities/${u}/students/${SEED.studentId}`), 200, 'lit SA fiche')
  assert.equal(await readAs(token, `universities/${u}/students`), 401, 'ne liste pas les étudiants')
  assert.equal(await readAs(token, `universities/${u}/teachers`), 401)
  assert.equal(await readAs(token, `universities/universite-autre/students/x1`), 401)
})

test('appel par un enseignant refusé (permission-denied), rien créé', async () => {
  const token = await signIn('prof@universite-demo.test', teacherPassword)
  const res = await call(
    'createUserAccount',
    { role: 'teacher', linkedRecordType: 'teacher', linkedRecordId: SEED.teacherId },
    token
  )
  assert.equal(res.error?.status, 'PERMISSION_DENIED')
  const record = (await seedApp().database().ref(`universities/${SEED.universityId}/teachers/${SEED.teacherId}`).get()).val()
  assert.equal(record.uid, undefined)
  await assert.rejects(seedApp().auth().getUserByEmail(SEED.teacher.email))
})

test('fiche d’une autre université introuvable (not-found), fiche non modifiée', async () => {
  const token = await signIn(SEED.admin.email, adminPassword)
  const res = await call('createUserAccount', { role: 'student', linkedRecordType: 'student', linkedRecordId: 'x1' }, token)
  assert.equal(res.error?.status, 'NOT_FOUND')
  assert.match(res.error!.message, /introuvable/)
  const record = (await seedApp().database().ref('universities/universite-autre/students/x1').get()).val()
  assert.equal(record.uid, undefined)
  await assert.rejects(seedApp().auth().getUserByEmail('autre@autre.test'))
})

test('appel non authentifié refusé', async () => {
  const res = await call('createUserAccount', { role: 'student', linkedRecordType: 'student', linkedRecordId: SEED.studentId })
  assert.equal(res.error?.status, 'UNAUTHENTICATED')
})

test('resendAccountInvite : nouveau lien généré pour la fiche liée', async () => {
  const token = await signIn(SEED.admin.email, adminPassword)
  const before = (await oobCodes(SEED.student.email)).length
  const res = await call('resendAccountInvite', { linkedRecordType: 'student', linkedRecordId: SEED.studentId }, token)
  assert.equal(res.error, undefined, JSON.stringify(res.error))
  assert.deepEqual(res.result, { invitationSent: true })
  assert.equal((await oobCodes(SEED.student.email)).length, before + 1)
})
