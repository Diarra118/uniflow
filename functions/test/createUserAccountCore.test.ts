import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  CREATE_RATE_LIMIT_PER_HOUR,
  createUserAccountCore,
  createUserAccountInputSchema,
  type CallerAuth,
} from '../src/auth/createUserAccountCore'
import { NOW, makeDeps, type FailPoint } from './fakes'

const ADMIN_U1: CallerAuth = { uid: 'admin-1', token: { role: 'admin_universite', universityId: 'u1' } }

function seed(overrides: Record<string, unknown> = {}) {
  return {
    users: {
      'admin-1': { uid: 'admin-1', role: 'admin_universite', universityId: 'u1', status: 'active' },
    },
    universities: {
      u1: {
        meta: { name: 'U1', plan: 'standard', status: 'active' },
        students: { s1: { firstName: 'Awa', lastName: 'Diallo', email: ' Awa.Diallo@Univ.EDU ' } },
        teachers: { t1: { firstName: 'Moussa', email: 'moussa@univ.edu' } },
      },
      u2: {
        meta: { name: 'U2', plan: 'standard', status: 'active' },
        students: { x1: { firstName: 'Autre', email: 'autre@u2.edu' } },
      },
    },
    ...overrides,
  }
}

const validInput = {
  role: 'student',
  linkedRecordType: 'student',
  linkedRecordId: 's1',
}

async function expectHttpsError(promise: Promise<unknown>, code: string, messageRe?: RegExp) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof HttpsError, `HttpsError attendue, reçu ${String(err)}`)
    assert.equal(err.code, code, err.message)
    if (messageRe) assert.match(err.message, messageRe)
    return true
  })
}

function assertNothingLeft(f: ReturnType<typeof makeDeps>, recordPath = 'universities/u1/students/s1') {
  assert.equal(f.users.size, 0, 'aucun compte Auth')
  assert.equal(f.claims.size, 0, 'aucun claim')
  assert.deepEqual(Object.keys(f.get('users') as object), ['admin-1'], 'aucun profil créé')
  assert.equal(f.get(`${recordPath}/uid`), null, 'fiche non liée')
}

// ---------------------------------------------------------------------
// Validation Zod
// ---------------------------------------------------------------------

test('Zod : refuse un champ email (toujours lu dans la fiche)', () => {
  assert.equal(createUserAccountInputSchema.safeParse({ ...validInput, email: 'x@y.z' }).success, false)
})

test('Zod : refuse un champ name (toujours lu dans la fiche)', () => {
  assert.equal(createUserAccountInputSchema.safeParse({ ...validInput, name: 'Usurpateur' }).success, false)
})

test('Zod : refuse les rôles administrateurs', () => {
  for (const role of ['admin_universite', 'super_admin_plateforme']) {
    assert.equal(createUserAccountInputSchema.safeParse({ ...validInput, role }).success, false)
  }
})

test('Zod : refuse un universityId fourni par le client', () => {
  assert.equal(createUserAccountInputSchema.safeParse({ ...validInput, universityId: 'u2' }).success, false)
})

test('Zod : refuse un rôle incohérent avec le type de fiche', () => {
  assert.equal(createUserAccountInputSchema.safeParse({ ...validInput, role: 'teacher' }).success, false)
})

test('Zod : refuse un identifiant de fiche qui sort du chemin', () => {
  for (const linkedRecordId of ['../u2/students/x1', 's1/uid', 'a.b', 'a#b', 'a$b', 'a[b]', 'a\u0007b', '']) {
    assert.equal(
      createUserAccountInputSchema.safeParse({ ...validInput, linkedRecordId }).success,
      false,
      JSON.stringify(linkedRecordId)
    )
  }
})

// ---------------------------------------------------------------------
// Appelant (A3) et isolation multi-tenant
// ---------------------------------------------------------------------

test('refuse un appel non authentifié', async () => {
  const f = makeDeps(seed())
  await expectHttpsError(createUserAccountCore(f.deps, undefined, validInput), 'unauthenticated')
  assertNothingLeft(f)
})

test('refuse un appelant dont le claim role n’est pas admin_universite', async () => {
  for (const role of ['teacher', 'student', 'parent', 'super_admin_plateforme', undefined]) {
    const f = makeDeps(seed())
    const caller: CallerAuth = { uid: 'admin-1', token: { role, universityId: 'u1' } }
    await expectHttpsError(createUserAccountCore(f.deps, caller, validInput), 'permission-denied')
    assertNothingLeft(f)
  }
})

test('refuse un universityId de claims absent ou mal formé', async () => {
  for (const universityId of [undefined, '', 'u1/students', 'u1.x', 42]) {
    const f = makeDeps(seed())
    const caller: CallerAuth = { uid: 'admin-1', token: { role: 'admin_universite', universityId } }
    await expectHttpsError(createUserAccountCore(f.deps, caller, validInput), 'permission-denied')
  }
})

test('admin suspendu (claims encore valides) refusé', async () => {
  const s = seed()
  s.users['admin-1'].status = 'suspended'
  const f = makeDeps(s)
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'permission-denied', /pas actif/)
  assertNothingLeft(f)
})

test('admin sans profil /users, ou profil d’une autre université, refusé', async () => {
  const noProfile = makeDeps(seed({ users: {} }))
  await expectHttpsError(createUserAccountCore(noProfile.deps, ADMIN_U1, validInput), 'permission-denied')

  const s = seed()
  s.users['admin-1'].universityId = 'u2'
  const otherTenant = makeDeps(s)
  await expectHttpsError(createUserAccountCore(otherTenant.deps, ADMIN_U1, validInput), 'permission-denied')
})

test('université suspendue ou archivée refusée', async () => {
  for (const status of ['suspended', 'archived']) {
    const s = seed()
    s.universities.u1.meta.status = status
    const f = makeDeps(s)
    await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'permission-denied', /suspendue ou archivée/)
    assertNothingLeft(f)
  }
})

test('université sans meta refusée', async () => {
  const s = seed()
  delete (s.universities.u1 as { meta?: unknown }).meta
  const f = makeDeps(s)
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'permission-denied')
})

test('invalid-argument sur entrée invalide', async () => {
  const f = makeDeps(seed())
  await expectHttpsError(
    createUserAccountCore(f.deps, ADMIN_U1, { ...validInput, role: 'admin_universite' }),
    'invalid-argument'
  )
})

test('isolation : une fiche d’une autre université est introuvable', async () => {
  const f = makeDeps(seed())
  await expectHttpsError(
    createUserAccountCore(f.deps, ADMIN_U1, { ...validInput, linkedRecordId: 'x1' }),
    'not-found',
    /introuvable/
  )
  assertNothingLeft(f)
  assert.equal(f.get('universities/u2/students/x1/uid'), null)
})

test('refuse une fiche qui a déjà un uid lié', async () => {
  const s = seed()
  ;(s.universities.u1.students.s1 as Record<string, unknown>).uid = 'old'
  const f = makeDeps(s)
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'already-exists')
  assert.equal(f.users.size, 0)
})

// ---------------------------------------------------------------------
// Email pris dans la fiche
// ---------------------------------------------------------------------

test('email : pris dans la fiche et normalisé', async () => {
  const f = makeDeps(seed())
  const res = await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  assert.equal(f.users.get(res.uid)!.email, 'awa.diallo@univ.edu')
  assert.equal((f.get(`users/${res.uid}`) as { email: string }).email, 'awa.diallo@univ.edu')
})

test('email : fiche sans email valide → failed-precondition', async () => {
  for (const email of [undefined, '', 'pas-un-email', 42]) {
    const s = seed()
    ;(s.universities.u1.students.s1 as Record<string, unknown>).email = email
    const f = makeDeps(s)
    await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'failed-precondition', /email/)
    assertNothingLeft(f)
  }
})

test('nom : displayName et /users.name = prénom + nom de la fiche', async () => {
  const f = makeDeps(seed())
  const res = await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  assert.equal(f.users.get(res.uid)!.displayName, 'Awa Diallo')
  assert.equal((f.get(`users/${res.uid}`) as { name: string }).name, 'Awa Diallo')

  // Fiche avec prénom seul (t1) : pas d'espace parasite.
  const t = await createUserAccountCore(f.deps, ADMIN_U1, {
    role: 'teacher',
    linkedRecordType: 'teacher',
    linkedRecordId: 't1',
  })
  assert.equal(f.users.get(t.uid)!.displayName, 'Moussa')
})

test('nom : fiche sans prénom ni nom → failed-precondition, rien créé', async () => {
  const s = seed()
  const s1 = s.universities.u1.students.s1 as Record<string, unknown>
  s1.firstName = '  '
  delete s1.lastName
  const f = makeDeps(s)
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'failed-precondition', /prénom ni nom/)
  assertNothingLeft(f)
})

test('email déjà utilisé : already-exists avec message générique', async () => {
  const f = makeDeps(seed())
  f.users.set('ailleurs', { email: 'awa.diallo@univ.edu', password: 'x', disabled: false })
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'already-exists', /Impossible de créer/)
  await assert.rejects(createUserAccountCore(f.deps, ADMIN_U1, validInput), (err: HttpsError) => {
    assert.doesNotMatch(err.message, /existe/)
    return true
  })
  assert.equal(f.get('universities/u1/usage/studentAccounts'), 0, 'quota rendu')
})

// ---------------------------------------------------------------------
// Chemin nominal et ordre des opérations (A1)
// ---------------------------------------------------------------------

test('crée le compte, le profil, lie la fiche et pose les claims du tenant de l’appelant', async () => {
  const f = makeDeps(seed())
  const res = await createUserAccountCore(f.deps, ADMIN_U1, validInput)

  const user = f.users.get(res.uid)!
  assert.ok(user.password.length >= 32, 'mot de passe aléatoire fort')
  assert.equal(user.disabled, false)
  assert.deepEqual(f.claims.get(res.uid), { role: 'student', universityId: 'u1' })
  assert.deepEqual(f.get(`users/${res.uid}`), {
    uid: res.uid,
    email: 'awa.diallo@univ.edu',
    name: 'Awa Diallo',
    role: 'student',
    universityId: 'u1',
    linkedRecordId: 's1',
    linkedRecordType: 'student',
    status: 'active',
    createdAt: NOW,
  })
  const record = f.get('universities/u1/students/s1') as Record<string, unknown>
  assert.equal(record.uid, res.uid)
  assert.equal(record.firstName, 'Awa', 'autres champs de la fiche conservés')
  assert.equal(f.get('universities/u1/usage/studentAccounts'), 1)
  assert.equal(res.invitationSent, true)
  assert.deepEqual(f.sentInvitations, ['awa.diallo@univ.edu'], 'invitation envoyée à l’email de la fiche')
  assert.deepEqual(Object.keys(res).sort(), ['invitationSent', 'uid'], 'aucun lien retourné')

  const serialized = JSON.stringify({ res, logs: f.logs })
  assert.ok(!serialized.includes(user.password), 'mot de passe jamais exposé')
})

test('ordre : createUser → /users (pending) → fiche → activation → claims EN DERNIER', async () => {
  const f = makeDeps(seed())
  const res = await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  const mutating = f.ops.filter((o) => !o.startsWith('tx:rateLimits') && !o.includes('/usage/'))
  assert.deepEqual(mutating, [
    'createUser',
    `set:users/${res.uid}`,
    'tx:universities/u1/students/s1',
    `update:users/${res.uid}`,
    'setClaims',
  ])
})

test('le profil est écrit en pending avant la fiche (aucun claim posé par le trigger)', async () => {
  const f = makeDeps(seed())
  let statusAtClaim: unknown
  let claimsAtClaim: number | undefined
  const tx = f.deps.db.transaction
  f.deps.db.transaction = async (path, update) => {
    if (path === 'universities/u1/students/s1') {
      statusAtClaim = (f.get('users/uid-1') as { status?: unknown } | null)?.status
      claimsAtClaim = f.claims.size
    }
    return tx(path, update)
  }
  await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  assert.equal(statusAtClaim, 'pending')
  assert.equal(claimsAtClaim, 0)
})

test('fonctionne aussi pour une fiche enseignant', async () => {
  const f = makeDeps(seed())
  const res = await createUserAccountCore(f.deps, ADMIN_U1, {
    role: 'teacher',
    linkedRecordType: 'teacher',
    linkedRecordId: 't1',
  })
  assert.equal(f.get('universities/u1/teachers/t1/uid'), res.uid)
  assert.deepEqual(f.claims.get(res.uid), { role: 'teacher', universityId: 'u1' })
  assert.equal(f.get('universities/u1/usage/teacherAccounts'), 1)
})

test('échec de l’envoi de l’invitation : non bloquant, compte conservé et actif', async () => {
  const f = makeDeps(seed(), ['sendInvite'])
  const res = await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  assert.equal(res.invitationSent, false)
  assert.equal(f.users.size, 1)
  assert.deepEqual(f.claims.get(res.uid), { role: 'student', universityId: 'u1' })
  const log = f.logs.find((l) => /invitation/.test(l.message))!
  assert.deepEqual(Object.keys(log.data!), ['uid', 'code'], 'ni email ni lien journalisé')
})

// ---------------------------------------------------------------------
// Quotas et limite de débit (A9)
// ---------------------------------------------------------------------

test('quota explicite atteint → resource-exhausted, rien créé', async () => {
  const s = seed()
  ;(s.universities.u1.meta as Record<string, unknown>).maxStudents = 3
  ;(s.universities.u1 as Record<string, unknown>).usage = { studentAccounts: 3 }
  const f = makeDeps(s)
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'resource-exhausted', /quota/)
  assertNothingLeft(f)
  assert.equal(f.get('universities/u1/usage/studentAccounts'), 3)
})

test('quota par défaut du plan appliqué si meta n’en définit pas', async () => {
  const s = seed()
  ;(s.universities.u1 as Record<string, unknown>).usage = { studentAccounts: 500 } // standard = 500
  const f = makeDeps(s)
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'resource-exhausted')

  const s2 = seed()
  s2.universities.u1.meta.plan = 'enterprise'
  ;(s2.universities.u1 as Record<string, unknown>).usage = { studentAccounts: 100_000 }
  const f2 = makeDeps(s2)
  await createUserAccountCore(f2.deps, ADMIN_U1, validInput)
})

test(`limite de débit : au-delà de ${CREATE_RATE_LIMIT_PER_HOUR} créations/heure → resource-exhausted`, async () => {
  const f = makeDeps(
    seed({ rateLimits: { createUserAccount: { 'admin-1': { windowStart: NOW, count: CREATE_RATE_LIMIT_PER_HOUR } } } })
  )
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'resource-exhausted', /Trop/)
  assert.equal(f.users.size, 0)

  f.advance(60 * 60 * 1000) // nouvelle fenêtre
  await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  assert.deepEqual(f.get('rateLimits/createUserAccount/admin-1'), { windowStart: NOW + 3_600_000, count: 1 })
})

test('limite de débit : le compteur s’incrémente à chaque création', async () => {
  const f = makeDeps(seed())
  await createUserAccountCore(f.deps, ADMIN_U1, validInput)
  await createUserAccountCore(f.deps, ADMIN_U1, {
    role: 'teacher',
    linkedRecordType: 'teacher',
    linkedRecordId: 't1',
  })
  assert.deepEqual(f.get('rateLimits/createUserAccount/admin-1'), { windowStart: NOW, count: 2 })
})

// ---------------------------------------------------------------------
// Rollback (A2)
// ---------------------------------------------------------------------

for (const step of ['setUsers', 'claimRecord', 'activate', 'setClaims'] as FailPoint[]) {
  test(`rollback complet si « ${step} » échoue`, async () => {
    const f = makeDeps(seed(), [step])
    await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'internal')
    assertNothingLeft(f)
    const record = f.get('universities/u1/students/s1') as Record<string, unknown>
    assert.equal(record.firstName, 'Awa', 'fiche intacte')
    assert.equal(f.get('universities/u1/usage/studentAccounts'), 0, 'quota rendu')
  })
}

test('rollback : ordre clear claims → disable → remove profil → libère fiche → deleteUser', async () => {
  const f = makeDeps(seed(), ['setClaims'])
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'internal')
  const afterFailure = f.ops.slice(f.ops.indexOf('update:users/uid-1') + 1)
  assert.deepEqual(afterFailure.slice(0, 5), [
    'clearClaims',
    'disableUser',
    'remove:users/uid-1',
    'tx:universities/u1/students/s1/uid',
    'deleteUser',
  ])
})

test('rollback : si deleteUser échoue, le compte reste désactivé et sans claims', async () => {
  const f = makeDeps(seed(), ['setClaims', 'deleteUser'])
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'internal')
  assert.equal(f.users.size, 1, 'compte Auth non supprimé (panne simulée)')
  const [uid, user] = [...f.users.entries()][0]
  assert.equal(user.disabled, true, 'compte désactivé')
  assert.deepEqual(f.claims.get(uid) ?? {}, {}, 'aucun claim')
  assert.equal(f.get(`users/${uid}`), null, 'profil retiré')
  assert.equal(f.get('universities/u1/students/s1/uid'), null, 'fiche libérée')
  assert.ok(f.logs.some((l) => /Rollback incomplet : deleteUser/.test(l.message)))
  assert.deepEqual(Object.keys(f.logs.find((l) => /deleteUser/.test(l.message))!.data!), ['uid', 'code'])
})

test('rollback : chaque sous-étape est tentée même si les précédentes échouent', async () => {
  const f = makeDeps(seed(), ['setClaims', 'clearClaims', 'disableUser', 'removeUsers'])
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'internal')
  assert.equal(f.get('universities/u1/students/s1/uid'), null, 'fiche libérée malgré les échecs')
  assert.equal(f.users.size, 0, 'compte supprimé malgré les échecs')
})

test('rollback : libère la fiche même si la réponse de la réservation s’est perdue', async () => {
  const f = makeDeps(seed(), ['claimRecordAfterCommit'])
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'internal')
  assertNothingLeft(f)
})

test('échec de createUser : erreur interne, rien écrit, quota rendu', async () => {
  const f = makeDeps(seed(), ['createUser'])
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'internal')
  assertNothingLeft(f)
  assert.equal(f.get('universities/u1/usage/studentAccounts'), 0)
})

// ---------------------------------------------------------------------
// Concurrence (A6)
// ---------------------------------------------------------------------

test('concurrence : fiche liée entre la vérification et la réservation → rollback', async () => {
  const f = makeDeps(seed())
  const tx = f.deps.db.transaction
  f.deps.db.transaction = async (path, update) => {
    if (path === 'universities/u1/students/s1') {
      // Un autre admin gagne la course juste avant notre transaction.
      const u1 = (f.db.universities as Record<string, { students: Record<string, Record<string, unknown>> }>).u1
      u1.students.s1.uid = 'uid-autre-admin'
    }
    return tx(path, update)
  }
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'already-exists')
  assert.equal(f.users.size, 0)
  assert.equal(f.get('universities/u1/students/s1/uid'), 'uid-autre-admin', 'lien existant préservé')
})

test('fiche supprimée pendant la création : not-found, aucune fiche fantôme', async () => {
  const f = makeDeps(seed())
  const tx = f.deps.db.transaction
  f.deps.db.transaction = async (path, update) => {
    if (path === 'universities/u1/students/s1') {
      delete (f.db.universities as Record<string, { students: Record<string, unknown> }>).u1.students.s1
    }
    return tx(path, update)
  }
  await expectHttpsError(createUserAccountCore(f.deps, ADMIN_U1, validInput), 'not-found')
  assert.equal(f.get('universities/u1/students/s1'), null, 'pas de fiche { uid } recréée')
  assert.equal(f.users.size, 0)
})
