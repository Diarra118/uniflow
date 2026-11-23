// Audit indépendant des Security Rules RTDB — Phase 1 (émulateur Database).
// Lancer depuis la racine : npm run test:audit:rules
import { test, before, after, beforeEach, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const OUT_DIR = new URL('./out/', import.meta.url)
mkdirSync(OUT_DIR, { recursive: true })
const OUT = new URL('rbac-matrix.json', OUT_DIR)
const require = createRequire(`${PROJECT}/rules/package.json`)
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing')
const { can } = await import(pathToFileURL(`${PROJECT}/src/core/rbac/permissions.ts`).href)

const RULES = readFileSync(`${PROJECT}/database.rules.json`, 'utf8')
let env

const ID = {
  adminA: { role: 'admin_universite', universityId: 'A' },
  teacherA: { role: 'teacher', universityId: 'A' },
  studentA: { role: 'student', universityId: 'A' },
  studentA2: { role: 'student', universityId: 'A' },
  parentA: { role: 'parent', universityId: 'A' },
  parentOther: { role: 'parent', universityId: 'A' },
  adminB: { role: 'admin_universite', universityId: 'B' },
  superAdmin: { role: 'super_admin_plateforme' },
  noRoleA: { universityId: 'A' },
  adminNoTenant: { role: 'admin_universite' },
  fakeRoleA: { role: 'root', universityId: 'A' },
}
const ROLE_UID = {
  super_admin_plateforme: 'superAdmin',
  admin_universite: 'adminA',
  teacher: 'teacherA',
  student: 'studentA',
  parent: 'parentA',
}
const db = (who) =>
  who === 'anon' ? env.unauthenticatedContext().database() : env.authenticatedContext(who, ID[who]).database()
const R = (who, p) => db(who).ref(p).get()
const W = (who, p, v) => db(who).ref(p).set(v)
const U = (who, p, v) => db(who).ref(p).update(v)
const D = (who, p) => db(who).ref(p).remove()

// Schéma exigé par les .validate de grades / exams / elearning.
const byAdmin = (t, courseId) => ({ courseId, createdBy: `admin${t}`, updatedBy: `admin${t}` })
/** Examen complet (type, date, coefficient, note maximale). */
const examOf = (courseId, author, extra = {}) => ({
  courseId, title: 'Partiel', type: 'midterm', date: '2026-11-20', coefficient: 1, maxScore: 20,
  createdBy: author, updatedBy: author, ...extra,
})
/** Note complète ; identifiant {examId}_{studentId}. */
const gradeOf = (examId, courseId, studentId, value, author) => ({ examId, courseId, studentId, value, createdBy: author, updatedBy: author })
// Créations « valides » de la matrice : note de la fiche a3 (filière p1)
// sur l'examen x1 du cours c1, et examen du cours c1.
const GRADE_CREATE = { id: () => 'x1_a3', value: (uid) => gradeOf('x1', 'c1', 'a3', 12, uid) }
const EXAM_CREATE = { id: (uid) => `audit-${uid}`, value: (uid) => examOf('c1', uid) }

function tenant(t) {
  const s = t.toLowerCase()
  return {
    meta: { name: `Université ${t}`, plan: 'standard', status: 'active', ownerUid: `admin${t}` },
    parentLinks: {
      [`parent${t}`]: {
        [`student${t}`]: { authorized: true }, [`student${t}2`]: { authorized: false },
        [`${s}1`]: { authorized: true }, [`${s}2`]: { authorized: false },
      },
      parentOther: { [`student${t}2`]: { authorized: true } },
    },
    students: {
      [`${s}1`]: { firstName: 'Awa', lastName: 'D', email: `awa@${s}.edu`, uid: `student${t}`, programId: 'p1' },
      [`${s}2`]: { firstName: 'Binta', lastName: 'B', email: `binta@${s}.edu`, uid: `student${t}2`, programId: 'p1' },
      [`${s}3`]: { firstName: 'Sans', lastName: 'Compte', email: `sc@${s}.edu`, programId: 'p1' },
      // Fiche liée à l'uid de chaque autre rôle (matrice ownStudentRecord).
      ...Object.fromEntries(['admin', 'teacher', 'parent'].map((r) => [`own-${r}${t}`, { firstName: r, email: `${r}@${s}.edu`, uid: `${r}${t}` }])),
      'own-superAdmin': { firstName: 'sa', email: `sa@${s}.edu`, uid: 'superAdmin' },
    },
    teachers: { [`t${s}1`]: { firstName: 'Moussa', email: `m@${s}.edu`, uid: `teacher${t}` } },
    programs: { p1: { name: 'Info' } },
    signupRequests: { req1: { uid: 'req1', email: `req1@${s}.edu`, firstName: 'Rita', lastName: 'Un', requestedRole: 'student', status: 'pending', createdAt: 1 } },
    // c1 confié à la fiche enseignant t<x>1 (uid teacher<T>), c2 à personne.
    courses: { c1: { name: 'Algo', teacherId: `t${s}1`, programId: 'p1' }, c2: { name: 'Sans responsable', programId: 'p1' } },
    classes: { k1: { name: 'L1' } },
    library: { l1: { title: 'Livre' } },
    elearning: { e1: { title: 'Module', ...byAdmin(t, 'c1') }, e2: { title: 'Autre', ...byAdmin(t, 'c2') } },
    academicYears: { y1: { label: '2026' } },
    indexes: { i1: { v: 1 } },
    exams: { x1: examOf('c1', `admin${t}`), x2: examOf('c2', `admin${t}`, { title: 'Autre' }) },
    enrollments: { en1: { studentId: `${s}1` }, en2: { studentId: `${s}2` } },
    grades: {
      // studentId = id de la fiche (a1 → uid studentA, a2 → studentA2).
      [`x1_${s}1`]: gradeOf('x1', 'c1', `${s}1`, 15, `admin${t}`),
      [`x1_${s}2`]: gradeOf('x1', 'c1', `${s}2`, 9, `admin${t}`),
      x2_sansLien: gradeOf('x2', 'c2', 'sansLien', 11, `admin${t}`),
    },
    payments: { pay1: { studentId: `student${t}`, amount: 100 }, pay2: { studentId: `student${t}2`, amount: 50 } },
    documents: {
      d1: { ownerUid: `student${t}`, ownerStudentId: `student${t}` },
      d2: { ownerUid: `student${t}2`, ownerStudentId: `student${t}2` },
    },
    notifications: Object.fromEntries(
      Object.values(ROLE_UID).map((uid) => [`n_${uid}`, { recipientUid: uid, text: 'x' }])
    ),
    aiInsights: { [`${s}1`]: { risk: 'low' } },
    usage: { studentAccounts: 2 },
  }
}

const SEED = {
  users: {
    adminA: { role: 'admin_universite', universityId: 'A', status: 'active', email: 'admin@a.edu' },
    teacherA: { role: 'teacher', universityId: 'A', status: 'active', email: 't@a.edu' },
    studentA: { role: 'student', universityId: 'A', status: 'active', email: 'awa@a.edu', linkedRecordId: 'a1', linkedRecordType: 'student' },
    parentA: { role: 'parent', universityId: 'A', status: 'active', email: 'p@a.edu' },
    adminB: { role: 'admin_universite', universityId: 'B', status: 'active', email: 'admin@b.edu' },
    studentB: { role: 'student', universityId: 'B', status: 'active', email: 'awa@b.edu', linkedRecordId: 'b1', linkedRecordType: 'student' },
    superAdmin: { role: 'super_admin_plateforme', status: 'active', email: 'sa@plateforme.io' },
  },
  universities: { A: tenant('A'), B: tenant('B') },
  platform: { universitiesIndex: { A: { plan: 'standard', status: 'active' }, B: { plan: 'premium', status: 'active' } } },
  rateLimits: { createUserAccount: { adminA: { windowStart: 1, count: 1 } } },
}
// Lien forgé côté B pour parentA (même uid) : ne doit rien ouvrir à parentA (claims A).
SEED.universities.B.parentLinks.parentA = { studentB: { authorized: true } }

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-audit-rules', database: { rules: RULES } })
})
after(async () => env?.cleanup())
async function reseed() {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled((ctx) => ctx.database().ref().set(SEED))
}
beforeEach(reseed)

// ---------------------------------------------------------------------
// 5a. Isolation A ↛ B (lecture ET écriture), pour chaque rôle de A
// ---------------------------------------------------------------------
const B_PATHS = [
  'universities/B/meta', 'universities/B/parentLinks/parentB', 'universities/B/parentLinks/parentA',
  'universities/B/parentLinks/parentB/studentB', 'universities/B/students', 'universities/B/students/b1',
  'universities/B/teachers', 'universities/B/teachers/tb1', 'universities/B/programs', 'universities/B/courses',
  'universities/B/classes', 'universities/B/grades/x1_b1', 'universities/B/exams/x1', 'universities/B/enrollments',
  'universities/B/enrollments/en1', 'universities/B/payments/pay1', 'universities/B/documents/d1',
  'universities/B/library', 'universities/B/elearning', 'universities/B/notifications/n_adminA',
  'universities/B/notifications/n_studentA', 'universities/B/academicYears', 'universities/B/aiInsights/b1',
  'universities/B/indexes', 'universities/B/usage', 'universities/B', 'users/adminB', 'users/studentB',
]

describe('5a. isolation multi-tenant A → B', () => {
  for (const who of ['adminA', 'teacherA', 'studentA', 'parentA']) {
    test(`${who} : aucune lecture dans B (${B_PATHS.length} chemins)`, async () => {
      for (const p of B_PATHS) await assertFails(R(who, p)).catch((e) => assert.fail(`${who} lit ${p} : ${e.message}`))
    })
    test(`${who} : aucune écriture dans B`, async () => {
      for (const p of B_PATHS) {
        await assertFails(W(who, `${p}/auditIntrusion`, { by: who })).catch((e) =>
          assert.fail(`${who} écrit ${p}/auditIntrusion : ${e.message}`)
        )
        await assertFails(W(who, p, null)).catch((e) => assert.fail(`${who} supprime ${p} : ${e.message}`))
      }
    })
  }
  test('contrôle positif : adminB lit et écrit bien dans B (le test n’est pas trivialement vrai)', async () => {
    await assertSucceeds(R('adminB', 'universities/B/students'))
    await assertSucceeds(W('adminB', 'universities/B/programs/p2', { name: 'Droit' }))
  })
})

// ---------------------------------------------------------------------
// 5b. Aucun utilisateur ne modifie son rôle, son tenant ou ses droits
// ---------------------------------------------------------------------
describe('5b. auto-élévation impossible', () => {
  for (const who of ['adminA', 'teacherA', 'studentA', 'parentA', 'superAdmin']) {
    test(`${who} : ne peut modifier ni rôle, ni universityId, ni statut, ni droits`, async () => {
      const attempts = [
        [`users/${who}/role`, 'super_admin_plateforme'],
        [`users/${who}/universityId`, 'B'],
        [`users/${who}/status`, 'active'],
        [`users/${who}`, { role: 'super_admin_plateforme', universityId: 'B', status: 'active' }],
        [`users/intrus-${who}`, { role: 'admin_universite', universityId: 'A', status: 'active' }],
        ['universities/A/meta/plan', 'enterprise'],
        ['universities/A/meta/maxStudents', 999999],
        ['universities/A/meta/status', 'active'],
        ['universities/A/usage/studentAccounts', 0],
        [`rateLimits/createUserAccount/${who}`, null],
        ['platform/universitiesIndex/A/plan', 'enterprise'],
      ]
      if (who !== 'adminA') {
        attempts.push([`universities/A/parentLinks/${who}/studentA2`, { authorized: true }])
        attempts.push(['universities/A/parentLinks/parentA/studentA2/authorized', true])
      }
      for (const [p, v] of attempts) {
        await assertFails(W(who, p, v)).catch((e) => assert.fail(`${who} écrit ${p} : ${e.message}`))
      }
    })
  }
  test('étudiant : ne modifie pas sa propre fiche ni son lien uid', async () => {
    await assertFails(U('studentA', 'universities/A/students/a1', { firstName: 'X' }))
    await assertFails(W('studentA', 'universities/A/students/a1/uid', 'studentA2'))
    await assertFails(W('studentA', 'universities/A/students/a3/uid', 'studentA'))
  })
  test('admin : ne peut ni détacher ni détourner le lien uid d’une fiche', async () => {
    await assertFails(U('adminA', 'universities/A/students/a1', { uid: null }))
    await assertFails(U('adminA', 'universities/A/students/a1', { uid: 'studentA2' }))
    await assertFails(U('adminA', 'universities/A/students/a3', { uid: 'adminA' }))
  })
})

// ---------------------------------------------------------------------
// 5c. super_admin_plateforme : métadonnées commerciales uniquement
// ---------------------------------------------------------------------
describe('5c. super_admin_plateforme', () => {
  test('lit platform/universitiesIndex (lecture seule)', async () => {
    await assertSucceeds(R('superAdmin', 'platform/universitiesIndex'))
    await assertSucceeds(R('superAdmin', 'platform/universitiesIndex/B'))
    await assertFails(W('superAdmin', 'platform/universitiesIndex/A/plan', 'enterprise'))
  })
  test('aucun accès pédagogique ni nominatif', async () => {
    const denied = [
      '/', 'universities', 'universities/A', 'universities/A/meta', 'universities/A/students',
      'universities/A/students/a1', 'universities/A/teachers', 'universities/A/grades/x1_a1',
      'universities/A/payments/pay1', 'universities/A/documents/d1', 'universities/A/enrollments',
      'universities/A/programs', 'universities/A/parentLinks/parentA', 'universities/A/notifications/n_superAdmin',
      'universities/A/aiInsights/a1', 'users', 'users/adminA', 'users/studentA', 'users/studentB',
    ]
    for (const p of denied) await assertFails(R('superAdmin', p)).catch((e) => assert.fail(`superAdmin lit ${p} : ${e.message}`))
  })
})

// ---------------------------------------------------------------------
// 5d. Parent : enfants autorisés, dans son tenant, via parentLinks
// ---------------------------------------------------------------------
describe('5d. parent', () => {
  test('lit ses liens et les données de l’enfant autorisé', async () => {
    for (const p of [
      'universities/A/parentLinks/parentA', 'universities/A/grades/x1_a1', 'universities/A/payments/pay1',
      'universities/A/documents/d1', 'universities/A/notifications/n_parentA', 'universities/A/meta',
    ]) await assertSucceeds(R('parentA', p)).catch((e) => assert.fail(`parentA devrait lire ${p} : ${e.message}`))
  })
  test('refusé : enfant non autorisé, sans lien, autres parents, fiches, autre tenant', async () => {
    for (const p of [
      'universities/A/grades/x1_a2', 'universities/A/grades/x2_sansLien', 'universities/A/payments/pay2',
      'universities/A/documents/d2', 'universities/A/parentLinks/parentOther', 'universities/A/parentLinks',
      'universities/A/students', 'universities/A/students/a1', 'universities/A/enrollments',
      'universities/A/exams/x1', 'universities/A/aiInsights/a1', 'universities/A/notifications/n_studentA',
      'universities/A/grades', 'universities/B/grades/x1_b1', 'universities/B/parentLinks/parentA',
    ]) await assertFails(R('parentA', p)).catch((e) => assert.fail(`parentA lit ${p} : ${e.message}`))
  })
  test('lien révoqué (authorized:false) → accès coupé', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      ctx.database().ref('universities/A/parentLinks/parentA/a1/authorized').set(false)
    )
    await assertFails(R('parentA', 'universities/A/grades/x1_a1'))
  })
})

// ---------------------------------------------------------------------
// 5e. Non authentifié / 3. claims invalides
// ---------------------------------------------------------------------
describe('5e + 3. non authentifié et claims invalides', () => {
  const PROTECTED = [
    '/', 'users', 'users/adminA', 'universities', 'universities/A', 'universities/A/meta',
    'universities/A/students', 'universities/A/students/a1', 'universities/A/teachers', 'universities/A/programs',
    'universities/A/grades/x1_a1', 'universities/A/payments/pay1', 'universities/A/documents/d1',
    'universities/A/notifications/n_studentA', 'universities/A/parentLinks/parentA', 'platform/universitiesIndex',
    'rateLimits',
  ]
  test('anonyme : aucune lecture ni écriture', async () => {
    for (const p of PROTECTED) {
      await assertFails(R('anon', p)).catch((e) => assert.fail(`anon lit ${p} : ${e.message}`))
      await assertFails(W('anon', `${p}/x`, 1)).catch((e) => assert.fail(`anon écrit ${p} : ${e.message}`))
    }
  })
  for (const who of ['noRoleA', 'adminNoTenant', 'fakeRoleA']) {
    test(`${who} (claims invalides) : aucun accès aux données du tenant`, async () => {
      for (const p of PROTECTED.filter((p) => p.startsWith('universities/A') || p === 'users/adminA')) {
        await assertFails(R(who, p)).catch((e) => assert.fail(`${who} lit ${p} : ${e.message}`))
      }
      await assertFails(W(who, 'universities/A/programs/x', { name: 'x' }))
    })
  }
})

// ---------------------------------------------------------------------
// Lot 2. Enseignant : écritures limitées à ses cours
// ---------------------------------------------------------------------
describe('lot 2. enseignant limité à ses cours', () => {
  const A = 'universities/A'
  const mine = { courseId: 'c1', createdBy: 'teacherA', updatedBy: 'teacherA' }
  const other = { courseId: 'c2', createdBy: 'teacherA', updatedBy: 'teacherA' }
  test('grades / exams : création et modification sur son cours, aucune suppression', async () => {
    // Notes : examen x1 (cours c1, le sien) ; x2 est sur c2 (sans responsable).
    await assertSucceeds(W('teacherA', `${A}/grades/x1_a3`, gradeOf('x1', 'c1', 'a3', 12, 'teacherA')))
    await assertSucceeds(U('teacherA', `${A}/grades/x1_a1`, { value: 16, updatedBy: 'teacherA' }))
    await assertFails(D('teacherA', `${A}/grades/x1_a1`))
    await assertFails(W('teacherA', `${A}/grades/x2_a3`, gradeOf('x2', 'c2', 'a3', 12, 'teacherA')))
    await assertFails(U('teacherA', `${A}/grades/x2_sansLien`, { value: 10, updatedBy: 'teacherA' }))
    // Examens.
    await assertSucceeds(W('teacherA', `${A}/exams/t-new`, examOf('c1', 'teacherA')))
    await assertSucceeds(U('teacherA', `${A}/exams/x1`, { title: 'Partiel S1', updatedBy: 'teacherA' }))
    await assertFails(D('teacherA', `${A}/exams/x1`))
    await assertFails(W('teacherA', `${A}/exams/t-other`, examOf('c2', 'teacherA')))
    await assertFails(U('teacherA', `${A}/exams/x2`, { title: 'x', updatedBy: 'teacherA' }))
  })
  test('elearning : CRUD sur son cours uniquement', async () => {
    await assertSucceeds(W('teacherA', `${A}/elearning/t-new`, { title: 't', ...mine }))
    await assertSucceeds(D('teacherA', `${A}/elearning/e1`))
    await assertFails(W('teacherA', `${A}/elearning/t-other`, { title: 't', ...other }))
    await assertFails(D('teacherA', `${A}/elearning/e2`))
  })
  test('documents / notifications : aucune écriture enseignant', async () => {
    for (const p of [`${A}/documents/d1`, `${A}/documents/t-new`, `${A}/notifications/n_teacherA`, `${A}/notifications/t-new`]) {
      await assertFails(W('teacherA', p, { recipientUid: 'studentA', ownerUid: 'studentA' }))
      await assertFails(D('teacherA', p))
    }
  })
  test('autre université : jamais, même avec un cours au même identifiant', async () => {
    await assertFails(W('teacherA', 'universities/B/grades/x1_b3', gradeOf('x1', 'c1', 'b3', 12, 'teacherA')))
    await assertFails(W('teacherA', 'universities/B/exams/t-new', examOf('c1', 'teacherA')))
  })
})

// ---------------------------------------------------------------------
// 4. Matrice RBAC : permissions.ts (UI) vs Security Rules (réel)
// ---------------------------------------------------------------------
const RES = {
  // students = la liste (et les fiches d'autrui) pour TOUS les rôles ;
  // ownStudentRecord = sa propre fiche (a1, uid studentA), rôle étudiant seulement.
  students: { list: 'students', item: 'students/a1', del: 'students/a3', listForAll: true },
  // Pour chaque rôle : la fiche liée à SON uid (a1 pour l'étudiant).
  ownStudentRecord: { item: 'students/OWN', del: 'students/OWN', own: true },
  teachers: { list: 'teachers', item: 'teachers/ta1', del: 'teachers/ta1' },
  programs: { list: 'programs', item: 'programs/p1', del: 'programs/p1' },
  courses: { list: 'courses', item: 'courses/c1', del: 'courses/c1' },
  classes: { list: 'classes', item: 'classes/k1', del: 'classes/k1' },
  enrollments: { list: 'enrollments', item: 'enrollments/en1', del: 'enrollments/en1' },
  library: { list: 'library', item: 'library/l1', del: 'library/l1' },
  elearning: { list: 'elearning', item: 'elearning/e1', del: 'elearning/e1' },
  academicYears: { list: 'academicYears', item: 'academicYears/y1', del: 'academicYears/y1' },
  grades: { item: 'grades/x1_a1', del: 'grades/x1_a1', create: GRADE_CREATE, update: (uid) => ({ value: 11, updatedBy: uid }) },
  exams: { item: 'exams/x1', del: 'exams/x1', create: EXAM_CREATE, update: (uid) => ({ title: 'Audit', updatedBy: uid }) },
  payments: { item: 'payments/pay1', del: 'payments/pay1' },
  documents: { item: 'documents/d1', del: 'documents/d1' },
  notifications: { item: 'notifications/n_ROLEUID', del: 'notifications/n_ROLEUID' },
  aiInsights: { item: 'aiInsights/a1', del: 'aiInsights/a1' },
  platformUniversities: { abs: true, list: 'platform/universitiesIndex', item: 'platform/universitiesIndex/A', del: 'platform/universitiesIndex/A' },
  // Demandes d'auto-inscription : lecture par l'admin de l'université,
  // aucune écriture client (décisions par les fonctions serveur).
  signupRequests: { list: 'signupRequests', item: 'signupRequests/req1', del: 'signupRequests/req1' },
}
const matrix = []

describe('4. matrice RBAC UI vs règles', () => {
  for (const [role, uid] of Object.entries(ROLE_UID)) {
    for (const [res, spec] of Object.entries(RES)) {
      test(`${role} × ${res}`, async () => {
        const base = spec.abs ? '' : 'universities/A/'
        const ownId = uid === 'studentA' ? 'a1' : `own-${uid}`
        const sub = (p) => base + p.replace('ROLEUID', uid).replace('OWN', ownId)
        const ok = async (op) => op.then(() => true, () => false)
        const parent = (spec.item.split('/')[0])
        const readTarget = spec.list && (spec.listForAll || (role !== 'student' && role !== 'parent')) ? spec.list : spec.item
        const ops = {
          read: () => R(uid, sub(readTarget)),
          // Écritures « valides » au sens des .validate, sur le cours de l'enseignant (c1).
          // Notes et examens : données complètes au sens des .validate (spec.create / spec.update).
          create: () => spec.create
            ? W(uid, sub(`${parent}/${spec.create.id(uid)}`), spec.create.value(uid))
            : W(uid, sub(`${parent}/audit-${uid}`), { name: 'audit', studentId: 'studentA', recipientUid: uid, courseId: 'c1', createdBy: uid, updatedBy: uid }),
          update: () => U(uid, sub(spec.item), spec.update ? spec.update(uid) : { auditField: 1, updatedBy: uid }),
          delete: () => D(uid, sub(spec.del)),
        }
        for (const action of ['read', 'create', 'update', 'delete']) {
          await reseed()
          const rules = await ok(ops[action]())
          // Sa propre fiche : accessible via ownStudentRecord OU via les droits
          // sur toutes les fiches (students).
          const ui = spec.own ? can(role, res, action) || can(role, 'students', action) : can(role, res, action)
          matrix.push({ role, res, action, ui, rules })
        }
      })
    }
  }
})

after(() => writeFileSync(OUT, JSON.stringify(matrix, null, 1)))
