import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpsError } from 'firebase-functions/v2/https'
import type { CallerAuth } from '../src/auth/accountShared'
import {
  RESEND_RATE_LIMIT_PER_ADMIN_PER_HOUR,
  RESEND_RATE_LIMIT_PER_RECORD_PER_HOUR,
  resendAccountInviteCore,
} from '../src/auth/resendAccountInviteCore'
import { NOW, makeDeps } from './fakes'

const ADMIN_U1: CallerAuth = { uid: 'admin-1', token: { role: 'admin_universite', universityId: 'u1' } }
const input = { linkedRecordType: 'student', linkedRecordId: 's1' }

function seed() {
  return {
    users: {
      'admin-1': { uid: 'admin-1', role: 'admin_universite', universityId: 'u1', status: 'active' },
      'stu-1': { uid: 'stu-1', role: 'student', universityId: 'u1', status: 'active', email: 'awa@univ.edu' },
    },
    universities: {
      u1: {
        meta: { plan: 'standard', status: 'active' },
        students: {
          s1: { firstName: 'Awa', email: ' AWA@univ.edu', uid: 'stu-1' },
          s2: { firstName: 'Sans accès', email: 'b@univ.edu' },
        },
      },
      u2: {
        meta: { plan: 'standard', status: 'active' },
        students: { x1: { email: 'x@u2.edu', uid: 'stu-x' } },
      },
    },
  }
}

async function expectHttpsError(promise: Promise<unknown>, code: string, messageRe?: RegExp) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof HttpsError, String(err))
    assert.equal(err.code, code, err.message)
    if (messageRe) assert.match(err.message, messageRe)
    return true
  })
}

test('renvoie l’invitation à l’email (normalisé) de la fiche', async () => {
  const f = makeDeps(seed())
  const res = await resendAccountInviteCore(f.deps, ADMIN_U1, input)
  assert.deepEqual(res, { invitationSent: true })
  assert.deepEqual(f.sentInvitations, ['awa@univ.edu'])
})

test('mêmes contrôles d’appelant que createUserAccount (A3)', async () => {
  await expectHttpsError(resendAccountInviteCore(makeDeps(seed()).deps, undefined, input), 'unauthenticated')

  const teacher: CallerAuth = { uid: 'admin-1', token: { role: 'teacher', universityId: 'u1' } }
  await expectHttpsError(resendAccountInviteCore(makeDeps(seed()).deps, teacher, input), 'permission-denied')

  const suspended = seed()
  suspended.users['admin-1'].status = 'suspended'
  await expectHttpsError(resendAccountInviteCore(makeDeps(suspended).deps, ADMIN_U1, input), 'permission-denied')

  const archived = seed()
  archived.universities.u1.meta.status = 'archived'
  await expectHttpsError(resendAccountInviteCore(makeDeps(archived).deps, ADMIN_U1, input), 'permission-denied')
})

test('entrée stricte : pas d’email ni d’universityId fournis par le client', async () => {
  const f = makeDeps(seed())
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, { ...input, email: 'pirate@x.y' }), 'invalid-argument')
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, { ...input, universityId: 'u2' }), 'invalid-argument')
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, { ...input, linkedRecordId: 's1/uid' }), 'invalid-argument')
  assert.equal(f.sentInvitations.length, 0)
})

test('isolation : fiche d’une autre université introuvable', async () => {
  const f = makeDeps(seed())
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, { ...input, linkedRecordId: 'x1' }), 'not-found')
  assert.equal(f.sentInvitations.length, 0)
})

test('fiche sans accès → failed-precondition', async () => {
  const f = makeDeps(seed())
  await expectHttpsError(
    resendAccountInviteCore(f.deps, ADMIN_U1, { ...input, linkedRecordId: 's2' }),
    'failed-precondition',
    /pas encore d'accès/
  )
})

test('email de la fiche modifié depuis la création → refus, aucun envoi', async () => {
  const s = seed()
  s.universities.u1.students.s1.email = 'quelquun-dautre@ailleurs.com'
  const f = makeDeps(s)
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, input), 'failed-precondition', /ne correspond plus/)
  assert.equal(f.sentInvitations.length, 0)
})

test('compte lié suspendu ou introuvable → refus', async () => {
  const suspended = seed()
  suspended.users['stu-1'].status = 'suspended'
  await expectHttpsError(resendAccountInviteCore(makeDeps(suspended).deps, ADMIN_U1, input), 'failed-precondition')

  const missing = seed()
  delete (missing.users as Record<string, unknown>)['stu-1']
  await expectHttpsError(resendAccountInviteCore(makeDeps(missing).deps, ADMIN_U1, input), 'failed-precondition')
})

test(`limite : ${RESEND_RATE_LIMIT_PER_RECORD_PER_HOUR} renvois/heure par fiche`, async () => {
  const f = makeDeps(seed())
  for (let i = 0; i < RESEND_RATE_LIMIT_PER_RECORD_PER_HOUR; i++) {
    await resendAccountInviteCore(f.deps, ADMIN_U1, input)
  }
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, input), 'resource-exhausted', /cette fiche/)
  assert.equal(f.sentInvitations.length, RESEND_RATE_LIMIT_PER_RECORD_PER_HOUR)
  f.advance(60 * 60 * 1000)
  await resendAccountInviteCore(f.deps, ADMIN_U1, input)
})

test(`limite : ${RESEND_RATE_LIMIT_PER_ADMIN_PER_HOUR} renvois/heure par administrateur`, async () => {
  const s = seed() as ReturnType<typeof seed> & { rateLimits?: unknown }
  s.rateLimits = {
    resendAccountInvite: { byAdmin: { 'admin-1': { windowStart: NOW, count: RESEND_RATE_LIMIT_PER_ADMIN_PER_HOUR } } },
  }
  const f = makeDeps(s)
  await expectHttpsError(resendAccountInviteCore(f.deps, ADMIN_U1, input), 'resource-exhausted', /renvois d'invitations/)
  assert.equal(f.sentInvitations.length, 0)
})

test('échec d’envoi : invitationSent false, seuls uid et code journalisés', async () => {
  const f = makeDeps(seed(), ['sendInvite'])
  const res = await resendAccountInviteCore(f.deps, ADMIN_U1, input)
  assert.deepEqual(res, { invitationSent: false })
  const log = f.logs.find((l) => /invitation/.test(l.message))!
  assert.deepEqual(Object.keys(log.data!), ['uid', 'code'])
})
