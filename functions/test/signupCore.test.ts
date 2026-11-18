import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpsError } from 'firebase-functions/v2/https'
import type { CallerAuth } from '../src/auth/accountShared'
import { listSignupUniversitiesCore, syncUniversityIndexCore } from '../src/signup/directoryCore'
import { SIGNUP_RATE_LIMIT_PER_HOUR, submitSignupRequestCore } from '../src/signup/submitSignupCore'
import { approveSignupRequestCore, rejectSignupRequestCore, signupRecordId } from '../src/signup/reviewSignupCore'
import { NOW, makeDeps, type FailPoint } from './fakes'

const ADMIN_U1: CallerAuth = { uid: 'admin-1', token: { role: 'admin_universite', universityId: 'u1' } }
const ADMIN_U2: CallerAuth = { uid: 'admin-2', token: { role: 'admin_universite', universityId: 'u2' } }
const REQ: CallerAuth = { uid: 'req-1', token: {} }

function seed() {
  return {
    users: {
      'admin-1': { uid: 'admin-1', role: 'admin_universite', universityId: 'u1', status: 'active' },
      'admin-2': { uid: 'admin-2', role: 'admin_universite', universityId: 'u2', status: 'active' },
    },
    platform: {
      universitiesIndex: {
        u1: { name: 'Université Une', plan: 'premium', status: 'active' },
        u2: { name: 'Autre École', plan: 'standard', status: 'trial' },
        u3: { name: 'Fermée', plan: 'standard', status: 'suspended' },
      },
    },
    universities: {
      u1: { meta: { name: 'Université Une', plan: 'standard', status: 'active', ownerUid: 'admin-1' } },
      u2: { meta: { name: 'Autre École', plan: 'standard', status: 'active' } },
      u3: { meta: { name: 'Fermée', plan: 'standard', status: 'suspended' } },
    },
  }
}

/** Dépendances avec le compte du demandeur déjà créé (sans claims). */
function withRequester(failAt: FailPoint[] = []) {
  const t = makeDeps(seed(), failAt)
  t.users.set('req-1', { email: 'Rita.Un@Exemple.TEST', password: 'x', disabled: false })
  return t
}

const input = { universityId: 'u1', requestedRole: 'student', firstName: 'Rita', lastName: 'Un' }

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof HttpsError, String(err))
    assert.equal(err.code, code, err.message)
    return true
  })
}

// ---------------------------------------------------------------- annuaire

test('annuaire : seulement id + nom des universités ouvertes, triées', async () => {
  const t = makeDeps(seed())
  const list = await listSignupUniversitiesCore(t.deps)
  assert.deepEqual(list, [
    { id: 'u2', name: 'Autre École' },
    { id: 'u1', name: 'Université Une' },
  ])
  for (const u of list) assert.deepEqual(Object.keys(u).sort(), ['id', 'name'])
})

test('annuaire : index tenu à jour depuis meta, retiré si meta disparaît', async () => {
  const t = makeDeps(seed())
  assert.equal(await syncUniversityIndexCore(t.deps, 'u3'), 'set')
  assert.deepEqual(t.get('platform/universitiesIndex/u3'), { name: 'Fermée', plan: 'standard', status: 'suspended' })
  t.deps.db.remove('universities/u2/meta')
  assert.equal(await syncUniversityIndexCore(t.deps, 'u2'), 'removed')
  assert.equal(t.get('platform/universitiesIndex/u2'), null)
  assert.equal(await syncUniversityIndexCore(t.deps, '../x'), 'skipped')
})

// ---------------------------------------------------------------- demande

test('demande : enregistrée en attente, e-mail lu dans le compte Auth, aucun droit', async () => {
  const t = withRequester()
  assert.deepEqual(await submitSignupRequestCore(t.deps, REQ, input), { status: 'pending' })
  const req = t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>
  assert.equal(req.email, 'rita.un@exemple.test')
  assert.equal(req.status, 'pending')
  assert.equal(req.requestedRole, 'student')
  assert.deepEqual(t.get('signupStatus/req-1'), {
    universityId: 'u1', universityName: 'Université Une', requestedRole: 'student', status: 'pending', createdAt: NOW,
  })
  assert.equal(t.get('users/req-1'), null)
  assert.equal(t.claims.get('req-1'), undefined)
})

test('demande : le client ne fournit ni e-mail, ni statut, ni rôle admin', async () => {
  const t = withRequester()
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, email: 'x@y.z' }), 'invalid-argument')
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, status: 'approved' }), 'invalid-argument')
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, requestedRole: 'admin_universite' }), 'invalid-argument')
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, universityId: '../users' }), 'invalid-argument')
})

test('demande : refus si déjà rattaché (claims dans le token ou le compte, ou profil)', async () => {
  const t = withRequester()
  await rejects(submitSignupRequestCore(t.deps, { uid: 'req-1', token: { role: 'student' } }, input), 'failed-precondition')
  t.claims.set('req-1', { role: 'student', universityId: 'u1' })
  await rejects(submitSignupRequestCore(t.deps, REQ, input), 'failed-precondition')
  const t2 = withRequester()
  await t2.deps.db.set('users/req-1', { status: 'active' })
  await rejects(submitSignupRequestCore(t2.deps, REQ, input), 'failed-precondition')
})

test('demande : refus sans connexion ou compte désactivé', async () => {
  const t = withRequester()
  await rejects(submitSignupRequestCore(t.deps, undefined, input), 'unauthenticated')
  t.users.get('req-1')!.disabled = true
  await rejects(submitSignupRequestCore(t.deps, REQ, input), 'permission-denied')
})

test('demande : université inexistante ou inactive refusée', async () => {
  const t = withRequester()
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, universityId: 'u9' }), 'not-found')
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, universityId: 'u3' }), 'not-found')
  assert.equal(t.get('signupStatus/req-1'), null)
})

test('demande : doublon refusé (une seule demande par compte)', async () => {
  const t = withRequester()
  await submitSignupRequestCore(t.deps, REQ, input)
  await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, universityId: 'u2' }), 'already-exists')
  assert.equal(t.get('universities/u2/signupRequests/req-1'), null)
})

test('demande : limite de tentatives par heure', async () => {
  const t = withRequester()
  for (let i = 0; i < SIGNUP_RATE_LIMIT_PER_HOUR; i++) {
    await rejects(submitSignupRequestCore(t.deps, REQ, { ...input, universityId: 'u9' }), 'not-found')
  }
  await rejects(submitSignupRequestCore(t.deps, REQ, input), 'resource-exhausted')
})

// ---------------------------------------------------------------- validation

async function pendingRequest(failAt: FailPoint[] = []) {
  const t = withRequester(failAt)
  await submitSignupRequestCore(t.deps, REQ, input)
  return t
}

test('validation : profil actif, fiche liée, claims, demande validée', async () => {
  const t = await pendingRequest()
  const res = await approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'ETU-77' })
  assert.deepEqual(res, { uid: 'req-1', linkedRecordId: signupRecordId('req-1') })
  const profile = t.get('users/req-1') as Record<string, unknown>
  assert.equal(profile.status, 'active')
  assert.equal(profile.role, 'student')
  assert.equal(profile.universityId, 'u1')
  assert.equal(profile.linkedRecordId, 'insc-req-1')
  const record = t.get('universities/u1/students/insc-req-1') as Record<string, unknown>
  assert.equal(record.uid, 'req-1')
  assert.equal(record.studentNumber, 'ETU-77')
  assert.equal(record.email, 'rita.un@exemple.test')
  assert.deepEqual(t.claims.get('req-1'), { role: 'student', universityId: 'u1' })
  assert.equal((t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>).status, 'approved')
  assert.equal((t.get('signupStatus/req-1') as Record<string, unknown>).status, 'approved')
  assert.equal(t.get('universities/u1/usage/studentAccounts'), 1)
  // Claims posés en dernier.
  assert.equal(t.ops.indexOf('setClaims'), t.ops.length - 3)
})

test('validation : une seule fois (verrou), puis « déjà traitée »', async () => {
  const t = await pendingRequest()
  await approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'ETU-77' })
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'ETU-78' }), 'failed-precondition')
  await rejects(rejectSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1' }), 'failed-precondition')
})

test('validation : un admin ne traite que les demandes de SA université', async () => {
  const t = await pendingRequest()
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U2, { uid: 'req-1', number: 'X' }), 'not-found')
  await rejects(rejectSignupRequestCore(t.deps, ADMIN_U2, { uid: 'req-1' }), 'not-found')
  await rejects(approveSignupRequestCore(t.deps, REQ, { uid: 'req-1', number: 'X' }), 'permission-denied')
  await rejects(
    approveSignupRequestCore(t.deps, { uid: 'req-1', token: { role: 'student', universityId: 'u1' } }, { uid: 'req-1', number: 'X' }),
    'permission-denied'
  )
  assert.equal((t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>).status, 'pending')
})

test('validation : matricule obligatoire, champ inconnu refusé', async () => {
  const t = await pendingRequest()
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: ' ' }), 'invalid-argument')
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'X', role: 'admin_universite' }), 'invalid-argument')
})

test('validation : panne avant les claims → tout annulé sauf le compte, demande remise en attente', async () => {
  const t = await pendingRequest(['setClaims'])
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'ETU-77' }), 'internal')
  assert.equal(t.get('users/req-1'), null)
  assert.equal(t.get('universities/u1/students/insc-req-1'), null)
  assert.deepEqual(t.claims.get('req-1') ?? {}, {})
  assert.equal(t.get('universities/u1/usage/studentAccounts'), 0)
  assert.equal((t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>).status, 'pending')
  assert.ok(t.users.has('req-1'), 'compte Auth conservé')
  assert.equal(t.users.get('req-1')!.disabled, false)
})

test('validation : compte du demandeur désactivé entre-temps → refus, demande en attente', async () => {
  const t = await pendingRequest()
  t.users.get('req-1')!.disabled = true
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'X' }), 'failed-precondition')
  assert.equal((t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>).status, 'pending')
})

test('validation : quota atteint → refus, demande en attente', async () => {
  const t = await pendingRequest()
  await t.deps.db.set('universities/u1/meta/maxStudents', 0)
  await rejects(approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'X' }), 'resource-exhausted')
  assert.equal((t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>).status, 'pending')
})

test('validation enseignant : fiche enseignant avec département', async () => {
  const t = withRequester()
  await submitSignupRequestCore(t.deps, REQ, { ...input, requestedRole: 'teacher' })
  await approveSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', number: 'ENS-9', department: 'Maths' })
  const record = t.get('universities/u1/teachers/insc-req-1') as Record<string, unknown>
  assert.equal(record.employeeNumber, 'ENS-9')
  assert.equal(record.department, 'Maths')
  assert.deepEqual(t.claims.get('req-1'), { role: 'teacher', universityId: 'u1' })
})

// ---------------------------------------------------------------- refus

test('refus : demande refusée (motif), compte désactivé, claims vidés, sessions révoquées', async () => {
  const t = await pendingRequest()
  await rejectSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1', reason: 'Inconnu du service.' })
  const req = t.get('universities/u1/signupRequests/req-1') as Record<string, unknown>
  assert.equal(req.status, 'rejected')
  assert.equal(req.reason, 'Inconnu du service.')
  assert.equal(req.decidedBy, 'admin-1')
  const status = t.get('signupStatus/req-1') as Record<string, unknown>
  assert.equal(status.status, 'rejected')
  assert.equal(status.reason, 'Inconnu du service.')
  assert.equal(t.users.get('req-1')!.disabled, true)
  assert.deepEqual(t.claims.get('req-1'), {})
  assert.ok(t.ops.includes('revokeTokens'))
  assert.equal(t.get('users/req-1'), null)
})

test('refus : rejouable si la désactivation a échoué', async () => {
  const t = await pendingRequest(['disableUser'])
  await rejects(rejectSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1' }), 'internal')
  assert.equal((t.get('signupStatus/req-1') as Record<string, unknown>).status, 'rejected')
  const t2 = makeDeps(JSON.parse(JSON.stringify(t.db)))
  t2.users.set('req-1', { email: 'r@x.y', password: 'x', disabled: false })
  await rejectSignupRequestCore(t2.deps, ADMIN_U1, { uid: 'req-1' })
  assert.equal(t2.users.get('req-1')!.disabled, true)
})

test('refus : demande inexistante → introuvable', async () => {
  const t = withRequester()
  await rejects(rejectSignupRequestCore(t.deps, ADMIN_U1, { uid: 'req-1' }), 'not-found')
})
