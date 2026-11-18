/**
 * Tests des Security Rules RTDB (../../database.rules.json) contre
 * l'émulateur Database. Lancer depuis la racine : `npm run test:rules`
 * (firebase emulators:exec fournit FIREBASE_DATABASE_EMULATOR_HOST).
 * Java 17+ requis par l'émulateur.
 */
import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
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
  teacherA2: { uid: 'teacherA2', claims: { role: 'teacher', universityId: 'A' } },
  // Enseignant authentifié mais sans fiche teachers/* liée (aucun cours).
  teacherNoRecord: { uid: 'teacherNoRecord', claims: { role: 'teacher', universityId: 'A' } },
  // Claims valides mais AUCUN profil /users (compte supprimé côté serveur).
  ghostTeacherA: { uid: 'ghostTeacherA', claims: { role: 'teacher', universityId: 'A' } },
  studentA: { uid: 'studentA', claims: { role: 'student', universityId: 'A' } },
  studentA2: { uid: 'studentA2', claims: { role: 'student', universityId: 'A' } },
  parentA: { uid: 'parentA', claims: { role: 'parent', universityId: 'A' } },
  parentB: { uid: 'parentB', claims: { role: 'parent', universityId: 'B' } },
  superAdmin: { uid: 'superAdmin', claims: { role: 'super_admin_plateforme' } },
  // Token avec un universityId mais sans rôle (ex : compte orphelin).
  noRoleA: { uid: 'noRoleA', claims: { universityId: 'A' } },
  weirdRoleA: { uid: 'weirdRoleA', claims: { role: 'hacker', universityId: 'A' } },
  // Auto-inscription : comptes créés par la personne elle-même, SANS claims.
  requester1: { uid: 'requester1' },
  requester2: { uid: 'requester2' },
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

/** Donnée rattachée à un cours avec son auteur : schéma exigé par les
 * .validate de grades, exams et elearning. */
const item = (author: string, courseId: string, extra: Record<string, unknown>) => ({
  ...extra,
  courseId,
  createdBy: author,
  updatedBy: author,
})

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
    // Profils actifs conformes aux tokens : les règles exigent désormais
    // /users/{uid} actif avec le même rôle et la même université.
    teacherA2: { uid: 'teacherA2', role: 'teacher', universityId: 'A', status: 'active' },
    teacherNoRecord: { uid: 'teacherNoRecord', role: 'teacher', universityId: 'A', status: 'active' },
    parentA: { uid: 'parentA', role: 'parent', universityId: 'A', status: 'active' },
    adminB: { uid: 'adminB', role: 'admin_universite', universityId: 'B', status: 'active' },
    parentB: { uid: 'parentB', role: 'parent', universityId: 'B', status: 'active' },
  },
  // État des demandes, écrit par les fonctions : lisible par son titulaire.
  signupStatus: {
    requester1: { universityId: 'A', universityName: 'A', requestedRole: 'student', status: 'pending', createdAt: 1 },
    requester2: { universityId: 'B', universityName: 'B', requestedRole: 'teacher', status: 'pending', createdAt: 1 },
  },
  universities: {
    A: {
      meta: { name: 'A', plan: 'standard', status: 'active' },
      signupRequests: {
        requester1: { uid: 'requester1', email: 'r1@a.edu', firstName: 'Rita', lastName: 'Un', requestedRole: 'student', status: 'pending', createdAt: 1 },
      },
      parentLinks: {
        parentA: { studentA: { authorized: true }, studentA2: { authorized: false } },
        parentA2: { studentA2: { authorized: true } },
      },
      students: {
        s1: { firstName: 'Awa', lastName: 'Diallo', email: 'awa@a.edu', uid: 'studentA' },
        s2: { firstName: 'Binta', lastName: 'Ba', email: 'binta@a.edu', uid: 'studentA2' },
        s3: { firstName: 'Cheikh', lastName: 'Sy', email: 'cheikh@a.edu' },
      },
      teachers: {
        t1: { firstName: 'Moussa', email: 'moussa@a.edu', uid: 'teacherA' },
        t2: { firstName: 'Fatou', email: 'fatou@a.edu', uid: 'teacherA2' },
      },
      programs: { p1: { name: 'Info' } },
      // c1 → teacherA (fiche t1), c2 → teacherA2 (fiche t2), c3 → aucun responsable.
      courses: {
        c1: { name: 'Algo', teacherId: 't1' },
        c2: { name: 'Réseaux', teacherId: 't2' },
        c3: { name: 'Sans responsable' },
      },
      classes: { k1: { name: 'L1' } },
      library: { l1: { title: 'Livre' } },
      elearning: {
        el1: { title: 'Module 1', courseId: 'c1', createdBy: 'adminA', updatedBy: 'adminA' },
        el2: { title: 'Module 2', courseId: 'c2', createdBy: 'adminA', updatedBy: 'adminA' },
      },
      academicYears: { y1: { label: '2026-2027' } },
      exams: {
        x1: { title: 'Partiel', courseId: 'c1', createdBy: 'adminA', updatedBy: 'adminA' },
        x2: { title: 'Final', courseId: 'c2', createdBy: 'adminA', updatedBy: 'adminA' },
      },
      indexes: { i1: { value: 1 } },
      enrollments: { e1: { studentId: 's1' }, e2: { studentId: 's2' } },
      grades: {
        g1: { studentId: 'studentA', value: 15, courseId: 'c1', createdBy: 'adminA', updatedBy: 'adminA' },
        g2: { studentId: 'studentA2', value: 12, courseId: 'c2', createdBy: 'adminA', updatedBy: 'adminA' },
      },
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
      signupRequests: {
        requester2: { uid: 'requester2', email: 'r2@b.edu', firstName: 'Remi', lastName: 'Deux', requestedRole: 'teacher', status: 'pending', createdAt: 1 },
      },
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

  test('écriture exams / elearning : admin partout, étudiant jamais', async () => {
    for (const path of [`${A}/exams/new`, `${A}/elearning/new`]) {
      await assertSucceeds(write('adminA', path, item('adminA', 'c2', { title: 't' })))
      await assertFails(write('studentA', path, item('studentA', 'c1', { title: 't3' })))
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
    await assertSucceeds(write('teacherA', `${A}/grades/g3`, item('teacherA', 'c1', { studentId: 'studentA', value: 10 })))
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
    // Aucune écriture enseignant (création, modification, suppression).
    await assertFails(write('teacherA', `${A}/documents/d3`, { ownerUid: 'studentA' }))
    await assertFails(patch('teacherA', `${A}/documents/d1`, { ownerUid: 'teacherA' }))
    await assertFails(del('teacherA', `${A}/documents/d1`))
    await assertSucceeds(write('adminA', `${A}/documents/d3`, { ownerUid: 'studentA' }))
  })

  test('21. notifications : destinataire seulement', async () => {
    await assertSucceeds(read('studentA', `${A}/notifications/n1`))
    await assertFails(read('studentA', `${A}/notifications/n2`))
    await assertFails(read('adminA', `${A}/notifications/n1`))
    await assertSucceeds(read('teacherA', `${A}/notifications/n2`))
    // Aucune écriture enseignant (création, modification, suppression).
    await assertFails(write('teacherA', `${A}/notifications/n3`, { recipientUid: 'studentA' }))
    await assertFails(patch('teacherA', `${A}/notifications/n2`, { recipientUid: 'studentA' }))
    await assertFails(del('teacherA', `${A}/notifications/n2`))
    await assertFails(write('studentA', `${A}/notifications/n3`, { recipientUid: 'studentA' }))
    await assertSucceeds(write('adminA', `${A}/notifications/n3`, { recipientUid: 'studentA' }))
  })
})

// ---------------------------------------------------------------------
// 21 bis. Enseignant : notes, examens et e-learning limités à SES cours
// (courses/{courseId}/teacherId → teachers/{id}/uid === auth.uid)
// ---------------------------------------------------------------------

describe('21 bis. enseignant : écritures limitées à ses cours', () => {
  test('grades : créer et modifier sur son cours ; jamais ailleurs ; jamais supprimer', async () => {
    const g = (extra: Record<string, unknown> = {}) => ({ studentId: 'studentA', value: 10, ...extra })
    await assertSucceeds(write('teacherA', `${A}/grades/new`, item('teacherA', 'c1', g())))
    await assertSucceeds(patch('teacherA', `${A}/grades/g1`, { value: 16, updatedBy: 'teacherA' }))
    // Cours d'un collègue, cours sans responsable, cours inexistant.
    await assertFails(write('teacherA', `${A}/grades/n2`, item('teacherA', 'c2', g())))
    await assertFails(write('teacherA', `${A}/grades/n3`, item('teacherA', 'c3', g())))
    await assertFails(write('teacherA', `${A}/grades/n4`, item('teacherA', 'c9', g())))
    await assertFails(patch('teacherA', `${A}/grades/g2`, { value: 20, updatedBy: 'teacherA' }))
    // Déplacer une note vers / depuis un cours qui n'est pas le sien.
    await assertFails(patch('teacherA', `${A}/grades/g1`, { courseId: 'c2', updatedBy: 'teacherA' }))
    await assertFails(patch('teacherA', `${A}/grades/g2`, { courseId: 'c1', updatedBy: 'teacherA' }))
    // Suppression d'une note interdite, même sur son cours.
    await assertFails(del('teacherA', `${A}/grades/g1`))
    await assertFails(write('teacherA', `${A}/grades/g1`, null))
    // Le collègue modifie bien son propre cours.
    await assertSucceeds(patch('teacherA2', `${A}/grades/g2`, { value: 13, updatedBy: 'teacherA2' }))
  })

  // Limite connue : les règles RTDB ne peuvent pas parcourir les champs
  // existants ; vider un champ d'une note de SON cours est donc une
  // modification autorisée. Se fermera en rendant obligatoires les champs
  // métier (ex. `value` numérique) quand le schéma des notes sera défini.
  test('grades : vider un champ métier d’une note de son cours', { todo: 'schéma des notes à définir (champ value obligatoire)' }, async () => {
    // Dernier auteur = cet enseignant (updatedBy), puis champ vidé.
    await assertSucceeds(patch('teacherA', `${A}/grades/g1`, { value: 16, updatedBy: 'teacherA' }))
    await assertFails(write('teacherA', `${A}/grades/g1/value`, null))
  })

  test('grades : auteur et structure validés (.validate)', async () => {
    // createdBy doit être l'auteur à la création, puis immuable.
    await assertFails(write('teacherA', `${A}/grades/n1`, { ...item('teacherA', 'c1', { studentId: 'studentA' }), createdBy: 'adminA' }))
    await assertFails(patch('teacherA', `${A}/grades/g1`, { createdBy: 'teacherA', updatedBy: 'teacherA' }))
    // updatedBy doit être l'auteur de CHAQUE écriture.
    await assertFails(write('teacherA', `${A}/grades/n1`, { ...item('teacherA', 'c1', { studentId: 'studentA' }), updatedBy: 'adminA' }))
    await assertFails(patch('teacherA', `${A}/grades/g1`, { value: 17 }))
    // Champs obligatoires.
    await assertFails(write('teacherA', `${A}/grades/n1`, item('teacherA', 'c1', {})))
    await assertFails(write('adminA', `${A}/grades/n1`, { studentId: 'studentA', createdBy: 'adminA', updatedBy: 'adminA' }))
  })

  test('grades : un enseignant sans fiche liée n’écrit nulle part', async () => {
    await assertFails(write('teacherNoRecord', `${A}/grades/n1`, item('teacherNoRecord', 'c1', { studentId: 'studentA' })))
    await assertFails(write('teacherNoRecord', `${A}/grades/n2`, item('teacherNoRecord', 'c3', { studentId: 'studentA' })))
  })

  test('grades : réaffectation du cours par l’admin → l’ancien enseignant perd l’accès', async () => {
    await assertSucceeds(write('adminA', `${A}/courses/c1/teacherId`, 't2'))
    await assertFails(patch('teacherA', `${A}/grades/g1`, { value: 18, updatedBy: 'teacherA' }))
    await assertSucceeds(patch('teacherA2', `${A}/grades/g1`, { value: 18, updatedBy: 'teacherA2' }))
  })

  test('grades : admin écrit sur tous les cours, peut changer le cours et supprimer', async () => {
    await assertSucceeds(write('adminA', `${A}/grades/n1`, item('adminA', 'c3', { studentId: 'studentA' })))
    await assertSucceeds(patch('adminA', `${A}/grades/g1`, { courseId: 'c2', updatedBy: 'adminA' }))
    await assertSucceeds(del('adminA', `${A}/grades/g2`))
  })

  test('exams : créer et modifier sur son cours, jamais supprimer', async () => {
    await assertSucceeds(write('teacherA', `${A}/exams/new`, item('teacherA', 'c1', { title: 'Rattrapage' })))
    await assertSucceeds(patch('teacherA', `${A}/exams/x1`, { title: 'Partiel S1', updatedBy: 'teacherA' }))
    await assertFails(write('teacherA', `${A}/exams/n2`, item('teacherA', 'c2', { title: 'x' })))
    await assertFails(patch('teacherA', `${A}/exams/x2`, { title: 'x', updatedBy: 'teacherA' }))
    await assertFails(del('teacherA', `${A}/exams/x1`))
    await assertSucceeds(del('adminA', `${A}/exams/x2`))
  })

  test('elearning : créer, modifier et supprimer sur son cours uniquement', async () => {
    await assertSucceeds(write('teacherA', `${A}/elearning/new`, item('teacherA', 'c1', { title: 'Vidéo' })))
    await assertSucceeds(patch('teacherA', `${A}/elearning/el1`, { title: 'Module 1 bis', updatedBy: 'teacherA' }))
    await assertSucceeds(del('teacherA', `${A}/elearning/el1`))
    await assertFails(write('teacherA', `${A}/elearning/n2`, item('teacherA', 'c2', { title: 'x' })))
    await assertFails(patch('teacherA', `${A}/elearning/el2`, { title: 'x', updatedBy: 'teacherA' }))
    await assertFails(del('teacherA', `${A}/elearning/el2`))
    await assertFails(write('teacherA', `${A}/elearning`, null)) // jamais la collection entière
    await assertFails(write('studentA', `${A}/elearning/n3`, item('studentA', 'c1', { title: 'x' })))
    await assertSucceeds(del('adminA', `${A}/elearning/el2`))
  })

  test('elearning : déplacer un contenu vers / depuis un cours qui n’est pas le sien', async () => {
    await assertFails(patch('teacherA', `${A}/elearning/el1`, { courseId: 'c2', updatedBy: 'teacherA' }))
    await assertFails(patch('teacherA', `${A}/elearning/el2`, { courseId: 'c1', updatedBy: 'teacherA' }))
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

// ---------------------------------------------------------------------
// 24. Révocation immédiate : profil /users actif et conforme au token
// ---------------------------------------------------------------------

const asAdminSdk = (fn: (root: CompatDatabase) => Promise<unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.database())
  })

/** Écouteur temps réel : nombre de valeurs reçues et éventuelle annulation. */
function listen(who: Who, path: string) {
  const ref = db(who).ref(path)
  const state = { values: 0, cancelled: null as string | null }
  ref.on(
    'value',
    () => { state.values++ },
    (err: unknown) => { state.cancelled = String((err as { code?: string })?.code ?? err) }
  )
  return { state, off: () => ref.off() }
}

async function waitFor(cond: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (cond()) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return cond()
}

describe('24. révocation immédiate (profil /users)', () => {
  test('suspension : la liste déjà ouverte est coupée et les nouvelles lectures refusées', async () => {
    const l = listen('teacherA', `${A}/students`)
    assert.ok(await waitFor(() => l.state.values > 0), 'liste chargée avant la suspension')
    await asAdminSdk((root) => root.ref('users/teacherA/status').set('suspended'))
    assert.ok(await waitFor(() => l.state.cancelled !== null), 'écouteur annulé après la suspension')
    l.off()
    await assertFails(read('teacherA', `${A}/students`))
    await assertFails(read('teacherA', `${A}/programs`))
    await assertFails(write('teacherA', `${A}/grades/n1`, item('teacherA', 'c1', { studentId: 'studentA' })))
  })

  test('changement de rôle : l’ancien accès est retiré immédiatement', async () => {
    const l = listen('teacherA', `${A}/teachers`)
    assert.ok(await waitFor(() => l.state.values > 0))
    // Le profil passe étudiant ; le token porte encore « teacher ».
    await asAdminSdk((root) => root.ref('users/teacherA/role').set('student'))
    assert.ok(await waitFor(() => l.state.cancelled !== null), 'écouteur annulé après le changement de rôle')
    l.off()
    await assertFails(read('teacherA', `${A}/students`))
    await assertFails(read('teacherA', `${A}/teachers`))
  })

  test('changement d’université : accès refusé', async () => {
    await asAdminSdk((root) => root.ref('users/teacherA/universityId').set('B'))
    await assertFails(read('teacherA', `${A}/students`))
    await assertFails(read('teacherA', 'universities/B/students'))
  })

  test('profil absent ou supprimé : accès refusé', async () => {
    await assertFails(read('ghostTeacherA', `${A}/students`))
    await assertFails(read('ghostTeacherA', `${A}/meta`))
    await asAdminSdk((root) => root.ref('users/studentA').remove())
    await assertFails(read('studentA', `${A}/students/s1`))
    await assertFails(read('studentA', `${A}/grades/g1`))
  })

  test('profil en attente (pending) : accès refusé', async () => {
    await asAdminSdk((root) => root.ref('users/parentA/status').set('pending'))
    await assertFails(read('parentA', `${A}/grades/g1`))
    await assertFails(read('parentA', `${A}/parentLinks/parentA`))
  })

  test('admin et super_admin suspendus : plus de lecture des profils ni de l’index', async () => {
    await asAdminSdk((root) => root.ref().update({ 'users/adminA/status': 'suspended', 'users/superAdmin/status': 'suspended' }))
    await assertFails(read('adminA', 'users/studentA'))
    await assertFails(write('adminA', `${A}/programs/x`, { name: 'x' }))
    await assertFails(read('superAdmin', 'platform/universitiesIndex'))
  })

  test('son propre profil reste lisible (l’interface y lit la suspension)', async () => {
    await asAdminSdk((root) => root.ref('users/studentA/status').set('suspended'))
    const snap = await read('studentA', 'users/studentA')
    assert.equal(snap.val().status, 'suspended')
    await asAdminSdk((root) => root.ref('users/studentA').remove())
    assert.equal((await read('studentA', 'users/studentA')).val(), null)
  })

  test('réactivation : l’utilisateur retrouve exactement ses droits', async () => {
    await asAdminSdk((root) => root.ref('users/teacherA/status').set('suspended'))
    await assertFails(read('teacherA', `${A}/students`))
    await asAdminSdk((root) => root.ref('users/teacherA/status').set('active'))
    await assertSucceeds(read('teacherA', `${A}/students`))
    await assertSucceeds(write('teacherA', `${A}/grades/n1`, item('teacherA', 'c1', { studentId: 'studentA' })))
    await assertFails(read('teacherA', `${A}/payments/pay1`))
  })
})

describe('25. auto-inscription (demandes d’inscription)', () => {
  const B = 'universities/B'
  const request = { uid: 'requester1', email: 'r1@a.edu', firstName: 'Rita', lastName: 'Un', requestedRole: 'student', status: 'pending', createdAt: 1 }

  test('le demandeur (sans claims) ne lit aucune donnée', async () => {
    for (const path of [
      `${A}/students`, `${A}/students/s1`, `${A}/teachers`, `${A}/programs`, `${A}/courses`,
      `${A}/classes`, `${A}/meta`, `${A}/signupRequests`, `${A}/signupRequests/requester1`,
      `${B}/signupRequests`, 'platform/universitiesIndex', 'users/adminA', 'signupStatus/requester2',
    ]) {
      await assertFails(read('requester1', path))
    }
  })

  test('il lit le statut de SA demande, personne d’autre ne le lit', async () => {
    const snap = await assertSucceeds(read('requester1', 'signupStatus/requester1'))
    assert.equal(snap.val().status, 'pending')
    await assertFails(read('requester2', 'signupStatus/requester1'))
    await assertFails(read('anon', 'signupStatus/requester1'))
    await assertFails(read('adminA', 'signupStatus/requester1'))
    await assertFails(read('requester1', 'signupStatus'))
  })

  test('il ne peut pas se valider lui-même', async () => {
    await assertFails(write('requester1', 'users/requester1', { uid: 'requester1', role: 'student', universityId: 'A', status: 'active' }))
    await assertFails(patch('requester1', 'signupStatus/requester1', { status: 'approved' }))
    await assertFails(patch('requester1', `${A}/signupRequests/requester1`, { status: 'approved' }))
    await assertFails(write('requester1', `${A}/students/moi`, { firstName: 'Rita', email: 'r1@a.edu', uid: 'requester1' }))
  })

  test('il ne peut ni modifier ni supprimer sa demande', async () => {
    await assertFails(patch('requester1', `${A}/signupRequests/requester1`, { requestedRole: 'teacher' }))
    await assertFails(write('requester1', `${A}/signupRequests/requester1`, { ...request, requestedRole: 'teacher' }))
    await assertFails(del('requester1', `${A}/signupRequests/requester1`))
    await assertFails(write('requester1', 'signupStatus/requester1', { universityId: 'A', status: 'pending' }))
    await assertFails(del('requester1', 'signupStatus/requester1'))
  })

  test('il ne peut pas viser une autre université', async () => {
    await assertFails(write('requester1', `${B}/signupRequests/requester1`, { ...request }))
    await assertFails(patch('requester1', 'signupStatus/requester1', { universityId: 'B' }))
    await assertFails(write('requester1', `${A}/signupRequests/autre`, { ...request, uid: 'autre' }))
  })

  test('l’admin A lit les demandes de A ; l’admin B ne voit pas celles de A', async () => {
    await assertSucceeds(read('adminA', `${A}/signupRequests`))
    await assertSucceeds(read('adminA', `${A}/signupRequests/requester1`))
    await assertFails(read('adminB', `${A}/signupRequests`))
    await assertFails(read('adminB', `${A}/signupRequests/requester1`))
    await assertSucceeds(read('adminB', `${B}/signupRequests`))
    await assertFails(read('adminA', `${B}/signupRequests`))
  })

  test('les autres rôles de A ne lisent pas les demandes', async () => {
    for (const who of ['teacherA', 'studentA', 'parentA', 'superAdmin', 'noRoleA'] as const) {
      await assertFails(read(who, `${A}/signupRequests`))
    }
  })

  test('aucune écriture client des demandes, même par l’admin (fonctions seulement)', async () => {
    await assertFails(patch('adminA', `${A}/signupRequests/requester1`, { status: 'approved' }))
    await assertFails(del('adminA', `${A}/signupRequests/requester1`))
    await assertFails(patch('adminA', 'signupStatus/requester1', { status: 'approved' }))
  })

  test('admin suspendu : plus de lecture des demandes', async () => {
    await asAdminSdk((root) => root.ref('users/adminA/status').set('suspended'))
    await assertFails(read('adminA', `${A}/signupRequests`))
  })
})
