/**
 * Tests des Security Rules RTDB (../../database.rules.json) contre
 * l'émulateur Database. Lancer depuis la racine : `npm run test:rules`
 * (firebase emulators:exec fournit FIREBASE_DATABASE_EMULATOR_HOST).
 * Java 17+ requis par l'émulateur.
 */
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'

const RULES = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8')

let env: RulesTestEnvironment

// ---------------------------------------------------------------------
// Identités
// ---------------------------------------------------------------------

type Claims = Record<string, unknown>

const IDS: Record<string, { uid: string; claims?: Claims }> = {
  adminA: { uid: 'adminA', claims: { role: 'admin_universite', universityId: 'A' } },
  adminB: { uid: 'adminB', claims: { role: 'admin_universite', universityId: 'B' } },
  adminNoTenant: { uid: 'adminNoTenant', claims: { role: 'admin_universite' } },
  teacherA: { uid: 'teacherA', claims: { role: 'teacher', universityId: 'A' } },
  studentA: { uid: 'studentA', claims: { role: 'student', universityId: 'A' } },
  studentA2: { uid: 'studentA2', claims: { role: 'student', universityId: 'A' } },
  parentA: { uid: 'parentA', claims: { role: 'parent', universityId: 'A' } },
  parentB: { uid: 'parentB', claims: { role: 'parent', universityId: 'B' } },
  superAdmin: { uid: 'superAdmin', claims: { role: 'super_admin_plateforme' } },
  // Token avec un universityId mais sans rôle (ex : compte orphelin).
  noRoleA: { uid: 'noRoleA', claims: { universityId: 'A' } },
  weirdRoleA: { uid: 'weirdRoleA', claims: { role: 'hacker', universityId: 'A' } },
}

type Who = keyof typeof IDS | 'anon'

// API compat : c'est ce que renvoie context.database().
type CompatDatabase = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['database']>

function db(who: Who): CompatDatabase {
  if (who === 'anon') return env.unauthenticatedContext().database()
  const { uid, claims } = IDS[who]
  return env.authenticatedContext(uid, claims).database()
}

const read = (who: Who, path: string) => db(who).ref(path).get()
const write = (who: Who, path: string, value: unknown) => db(who).ref(path).set(value)
const patch = (who: Who, path: string, values: Record<string, unknown>) => db(who).ref(path).update(values)
const del = (who: Who, path: string) => db(who).ref(path).remove()

// ---------------------------------------------------------------------
// Données de départ (écrites règles désactivées)
// ---------------------------------------------------------------------

const SEED = {
  users: {
    adminA: { uid: 'adminA', role: 'admin_universite', universityId: 'A', status: 'active' },
    teacherA: { uid: 'teacherA', role: 'teacher', universityId: 'A', status: 'active' },
    studentA: { uid: 'studentA', role: 'student', universityId: 'A', status: 'active', linkedRecordId: 's1' },
    studentA2: { uid: 'studentA2', role: 'student', universityId: 'A', status: 'active', linkedRecordId: 's2' },
    userB: { uid: 'userB', role: 'student', universityId: 'B', status: 'active' },
    superAdmin: { uid: 'superAdmin', role: 'super_admin_plateforme', status: 'active' },
  },
  universities: {
    A: {
      meta: { name: 'A', plan: 'standard', status: 'active' },
      parentLinks: {
        parentA: { studentA: { authorized: true }, studentA2: { authorized: false } },
        parentA2: { studentA2: { authorized: true } },
      },
      students: {
        s1: { firstName: 'Awa', lastName: 'Diallo', email: 'awa@a.edu', uid: 'studentA' },
        s2: { firstName: 'Binta', lastName: 'Ba', email: 'binta@a.edu', uid: 'studentA2' },
        s3: { firstName: 'Cheikh', lastName: 'Sy', email: 'cheikh@a.edu' },
      },
      teachers: { t1: { firstName: 'Moussa', email: 'moussa@a.edu', uid: 'teacherA' } },
      programs: { p1: { name: 'Info' } },
      courses: { c1: { name: 'Algo' } },
      classes: { k1: { name: 'L1' } },
      library: { l1: { title: 'Livre' } },
      elearning: { el1: { title: 'Module' } },
      academicYears: { y1: { label: '2026-2027' } },
      exams: { x1: { title: 'Partiel' } },
      indexes: { i1: { value: 1 } },
      enrollments: { e1: { studentId: 's1' }, e2: { studentId: 's2' } },
      grades: { g1: { studentId: 'studentA', value: 15 }, g2: { studentId: 'studentA2', value: 12 } },
      payments: { pay1: { studentId: 'studentA', amount: 100 }, pay2: { studentId: 'studentA2', amount: 100 } },
      documents: {
        d1: { ownerUid: 'studentA', ownerStudentId: 'studentA' },
        d2: { ownerUid: 'studentA2', ownerStudentId: 'studentA2' },
      },
      notifications: { n1: { recipientUid: 'studentA' }, n2: { recipientUid: 'teacherA' } },
      aiInsights: { s1: { risk: 'low' } },
      usage: { studentAccounts: 2 },
    },
    B: {
      meta: { name: 'B', plan: 'standard', status: 'active' },
      students: { sb1: { firstName: 'Autre', email: 'autre@b.edu' } },
      programs: { pb1: { name: 'Droit' } },
    },
  },
  platform: { universitiesIndex: { A: { plan: 'standard', status: 'active' } } },
  rateLimits: { createUserAccount: { adminA: { windowStart: 1, count: 1 } } },
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-uniflow-rules',
    database: { rules: RULES },
  })
})

after(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref().set(SEED)
  })
})

const A = 'universities/A'

// ---------------------------------------------------------------------
// 1-5. /users
// ---------------------------------------------------------------------

describe('/users', () => {
  test('1. lecture non authentifiée refusée', async () => {
    await assertFails(read('anon', 'users/studentA'))
  })

  test('2. lecture de son propre profil autorisée, celle d’un autre refusée', async () => {
    await assertSucceeds(read('studentA', 'users/studentA'))
    await assertFails(read('studentA', 'users/studentA2'))
    await assertFails(read('teacherA', 'users/studentA'))
  })

  test('3. admin : profils de son université seulement', async () => {
    await assertSucceeds(read('adminA', 'users/studentA'))
    await assertFails(read('adminA', 'users/userB'))
    await assertFails(read('adminA', 'users/superAdmin'))
    await assertFails(read('adminNoTenant', 'users/superAdmin'))
    await assertFails(read('adminB', 'users/studentA'))
  })

  test('4. lister /users refusé pour tous', async () => {
    for (const who of ['adminA', 'teacherA', 'studentA', 'superAdmin'] as Who[]) {
      await assertFails(read(who, 'users'))
    }
  })

  test('5. aucune écriture client sur /users, même sur soi ou par un admin', async () => {
    await assertFails(write('studentA', 'users/studentA/role', 'admin_universite'))
    await assertFails(write('studentA', 'users/studentA', { role: 'admin_universite' }))
    await assertFails(write('adminA', 'users/studentA/role', 'teacher'))
    await assertFails(write('adminA', 'users/newUser', { role: 'student', universityId: 'A' }))
    await assertFails(write('superAdmin', 'users/x', { role: 'super_admin_plateforme' }))
  })
})

// ---------------------------------------------------------------------
// 6-8. meta, niveaux parents, noeuds non déclarés
// ---------------------------------------------------------------------

describe('meta et noeuds parents', () => {
  test('6. meta : membres (rôle valide) seulement, jamais d’écriture', async () => {
    for (const who of ['adminA', 'teacherA', 'studentA', 'parentA'] as Who[]) {
      await assertSucceeds(read(who, `${A}/meta`))
    }
    for (const who of ['adminB', 'superAdmin', 'noRoleA', 'weirdRoleA', 'anon'] as Who[]) {
      await assertFails(read(who, `${A}/meta`))
    }
    await assertFails(write('adminA', `${A}/meta/plan`, 'enterprise'))
    await assertFails(write('adminA', `${A}/meta/maxStudents`, 999999))
  })

  test('7. lecture de /universities/A ou de la racine refusée (pas de cascade)', async () => {
    for (const who of ['adminA', 'teacherA', 'superAdmin'] as Who[]) {
      await assertFails(read(who, A))
      await assertFails(read(who, 'universities'))
      await assertFails(read(who, '/'))
    }
  })

  test('8. noeuds non déclarés refusés (parents, usage, rateLimits)', async () => {
    await assertFails(read('adminA', `${A}/parents/x`))
    await assertFails(write('adminA', `${A}/parents/x`, { email: 'p@a.edu' }))
    await assertFails(read('adminA', `${A}/usage`))
    await assertFails(write('adminA', `${A}/usage/studentAccounts`, 0))
    await assertFails(read('adminA', 'rateLimits/createUserAccount/adminA'))
    await assertFails(write('adminA', 'rateLimits/createUserAccount/adminA', null))
  })
})

// ---------------------------------------------------------------------
// 9-15. students / teachers
// ---------------------------------------------------------------------

describe('students / teachers', () => {
  test('9. admin : lecture/écriture dans son université seulement', async () => {
    await assertSucceeds(read('adminA', `${A}/students`))
    await assertSucceeds(write('adminA', `${A}/students/s4`, { firstName: 'D', email: 'd@a.edu' }))
    await assertFails(read('adminA', 'universities/B/students'))
    await assertFails(write('adminA', 'universities/B/students/sb2', { firstName: 'X' }))
    await assertFails(read('adminB', `${A}/students`))
  })

  test('10. lecture : enseignant liste, étudiant ne lit QUE sa fiche, parent rien', async () => {
    await assertSucceeds(read('teacherA', `${A}/students`))
    await assertSucceeds(read('teacherA', `${A}/teachers`))
    await assertFails(read('studentA', `${A}/students`))
    await assertSucceeds(read('studentA', `${A}/students/s1`))
    await assertFails(read('studentA', `${A}/students/s2`))
    await assertFails(read('studentA', `${A}/students/s3`))
    await assertFails(read('studentA', `${A}/teachers`))
    await assertFails(read('parentA', `${A}/students`))
    await assertFails(read('parentA', `${A}/students/s1`))
  })

  test('11. écriture interdite aux enseignants et étudiants (même sur sa fiche)', async () => {
    await assertFails(write('teacherA', `${A}/students/s1/firstName`, 'X'))
    await assertFails(write('studentA', `${A}/students/s1/firstName`, 'X'))
    await assertFails(write('studentA', `${A}/students/s1/uid`, 'studentA'))
    await assertFails(write('teacherA', `${A}/teachers/t1/firstName`, 'X'))
  })

  test('12. uid : ni posé ni modifié côté client ; autres champs et suppression OK', async () => {
    await assertFails(write('adminA', `${A}/students/s3/uid`, 'studentA'))
    await assertFails(patch('adminA', `${A}/students/s3`, { uid: 'x' }))
    await assertFails(write('adminA', `${A}/students/s1/uid`, 'autre'))
    await assertFails(write('adminA', `${A}/teachers/t1/uid`, 'autre'))
    await assertSucceeds(patch('adminA', `${A}/students/s1`, { firstName: 'Awa-Marie' }))
    await assertSucceeds(
      write('adminA', `${A}/students/s1`, { firstName: 'Awa', email: 'awa@a.edu', uid: 'studentA' })
    )
    await assertSucceeds(del('adminA', `${A}/students/s1`))
    await assertSucceeds(del('adminA', `${A}/teachers/t1`))
  })

  test('13. update({uid:null}) refusé (lien non détachable sans supprimer la fiche)', async () => {
    await assertFails(patch('adminA', `${A}/students/s1`, { uid: null }))
    await assertFails(del('adminA', `${A}/students/s1/uid`))
    await assertFails(write('adminA', `${A}/students/s1`, { firstName: 'Awa', email: 'awa@a.edu' }))
    await assertFails(patch('adminA', `${A}/teachers/t1`, { uid: null }))
  })

  test('14. token avec universityId mais sans rôle (ou rôle inconnu) refusé', async () => {
    for (const who of ['noRoleA', 'weirdRoleA'] as Who[]) {
      await assertFails(read(who, `${A}/students`))
      await assertFails(read(who, `${A}/students/s1`))
      await assertFails(read(who, `${A}/programs`))
      await assertFails(read(who, `${A}/enrollments`))
      await assertFails(read(who, `${A}/exams/x1`))
    }
  })

  test('15. super_admin : aucun accès aux fiches', async () => {
    await assertFails(read('superAdmin', `${A}/students`))
    await assertFails(read('superAdmin', `${A}/teachers`))
    await assertFails(read('superAdmin', `${A}/students/s1`))
  })
})

// ---------------------------------------------------------------------
// 16. Collections de l'université
// ---------------------------------------------------------------------

describe('16. collections de l’université', () => {
  const readable = ['programs', 'courses', 'classes', 'library', 'academicYears', 'elearning', 'indexes']

  test('lecture : admin, enseignant, étudiant ; jamais parent, sans-rôle ni autre université', async () => {
    for (const coll of readable) {
      for (const who of ['adminA', 'teacherA', 'studentA'] as Who[]) {
        await assertSucceeds(read(who, `${A}/${coll}`))
      }
      for (const who of ['parentA', 'noRoleA', 'adminB', 'superAdmin'] as Who[]) {
        await assertFails(read(who, `${A}/${coll}`))
      }
    }
    for (const who of ['adminA', 'teacherA', 'studentA'] as Who[]) {
      await assertSucceeds(read(who, `${A}/exams/x1`))
    }
    await assertFails(read('parentA', `${A}/exams/x1`))
  })

  test('écriture : admin seul (programs, courses, classes, library, academicYears)', async () => {
    for (const coll of ['programs', 'courses', 'classes', 'library', 'academicYears']) {
      await assertSucceeds(write('adminA', `${A}/${coll}/new`, { name: 'n' }))
      await assertFails(write('teacherA', `${A}/${coll}/new2`, { name: 'n' }))
      await assertFails(write('studentA', `${A}/${coll}/new3`, { name: 'n' }))
      await assertFails(write('adminB', `${A}/${coll}/new4`, { name: 'n' }))
    }
  })

  test('écriture : admin et enseignant (exams, elearning)', async () => {
    for (const path of [`${A}/exams/new`, `${A}/elearning/new`]) {
      await assertSucceeds(write('adminA', path, { title: 't' }))
      await assertSucceeds(write('teacherA', path, { title: 't2' }))
      await assertFails(write('studentA', path, { title: 't3' }))
    }
  })

  test('enrollments : admin/enseignant listent, étudiant ne lit que les siennes', async () => {
    await assertSucceeds(read('adminA', `${A}/enrollments`))
    await assertSucceeds(read('teacherA', `${A}/enrollments`))
    await assertFails(read('studentA', `${A}/enrollments`))
    await assertSucceeds(read('studentA', `${A}/enrollments/e1`))
    await assertFails(read('studentA', `${A}/enrollments/e2`))
    await assertFails(read('parentA', `${A}/enrollments/e1`))
    await assertFails(write('teacherA', `${A}/enrollments/e3`, { studentId: 's1' }))
    await assertSucceeds(write('adminA', `${A}/enrollments/e3`, { studentId: 's1' }))
  })
})

// ---------------------------------------------------------------------
// 17-21. Données par élève
// ---------------------------------------------------------------------

describe('données par élève', () => {
  test('17. parentLinks : un parent liste SES liens, pas ceux des autres', async () => {
    await assertSucceeds(read('parentA', `${A}/parentLinks/parentA`))
    await assertSucceeds(read('parentA', `${A}/parentLinks/parentA/studentA`))
    await assertFails(read('parentA', `${A}/parentLinks/parentA2`))
    await assertFails(read('parentA', `${A}/parentLinks`))
    await assertFails(read('parentB', `${A}/parentLinks/parentB`))
    await assertFails(read('studentA', `${A}/parentLinks/studentA`))
    await assertSucceeds(read('adminA', `${A}/parentLinks/parentA`))
    await assertSucceeds(write('adminA', `${A}/parentLinks/parentA/studentA2`, { authorized: true }))
    await assertFails(write('parentA', `${A}/parentLinks/parentA/studentA2`, { authorized: true }))
  })

  test('18. grades', async () => {
    await assertSucceeds(read('studentA', `${A}/grades/g1`))
    await assertFails(read('studentA', `${A}/grades/g2`))
    await assertSucceeds(read('parentA', `${A}/grades/g1`))
    await assertFails(read('parentA', `${A}/grades/g2`)) // lien non autorisé
    await assertSucceeds(read('teacherA', `${A}/grades/g2`))
    await assertSucceeds(write('teacherA', `${A}/grades/g3`, { studentId: 'studentA', value: 10 }))
    await assertFails(write('studentA', `${A}/grades/g1/value`, 20))
    await assertFails(read('adminA', `${A}/grades`)) // pas de lecture au niveau liste
    await assertFails(read('adminB', `${A}/grades/g1`))
  })

  test('19. payments', async () => {
    await assertSucceeds(read('studentA', `${A}/payments/pay1`))
    await assertFails(read('studentA', `${A}/payments/pay2`))
    await assertSucceeds(read('parentA', `${A}/payments/pay1`))
    await assertFails(read('parentA', `${A}/payments/pay2`))
    await assertFails(read('teacherA', `${A}/payments/pay1`))
    await assertSucceeds(read('adminA', `${A}/payments/pay1`))
    await assertFails(write('teacherA', `${A}/payments/pay3`, { studentId: 'studentA' }))
    await assertFails(write('studentA', `${A}/payments/pay1/amount`, 0))
  })

  test('20. documents', async () => {
    await assertSucceeds(read('studentA', `${A}/documents/d1`))
    await assertFails(read('studentA', `${A}/documents/d2`))
    await assertSucceeds(read('parentA', `${A}/documents/d1`))
    await assertFails(read('parentA', `${A}/documents/d2`))
    await assertSucceeds(read('teacherA', `${A}/documents/d2`))
    await assertFails(write('studentA', `${A}/documents/d3`, { ownerUid: 'studentA' }))
  })

  test('21. notifications : destinataire seulement', async () => {
    await assertSucceeds(read('studentA', `${A}/notifications/n1`))
    await assertFails(read('studentA', `${A}/notifications/n2`))
    await assertFails(read('adminA', `${A}/notifications/n1`))
    await assertSucceeds(read('teacherA', `${A}/notifications/n2`))
    await assertSucceeds(write('teacherA', `${A}/notifications/n3`, { recipientUid: 'studentA' }))
    await assertFails(write('studentA', `${A}/notifications/n3`, { recipientUid: 'studentA' }))
  })
})

// ---------------------------------------------------------------------
// 22-23. aiInsights / indexes / platform
// ---------------------------------------------------------------------

describe('aiInsights, indexes, platform', () => {
  test('22. aiInsights et indexes : jamais d’écriture client', async () => {
    await assertSucceeds(read('teacherA', `${A}/aiInsights/s1`))
    await assertFails(read('studentA', `${A}/aiInsights/s1`))
    await assertFails(write('adminA', `${A}/aiInsights/s1`, { risk: 'high' }))
    await assertFails(write('adminA', `${A}/indexes/i1`, { value: 2 }))
  })

  test('23. platform/universitiesIndex : super_admin en lecture seule', async () => {
    await assertSucceeds(read('superAdmin', 'platform/universitiesIndex'))
    await assertFails(read('adminA', 'platform/universitiesIndex'))
    await assertFails(read('adminA', 'platform/universitiesIndex/A'))
    await assertFails(write('superAdmin', 'platform/universitiesIndex/A/plan', 'enterprise'))
  })
})
