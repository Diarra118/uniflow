/**
 * Données de démonstration pour les ÉMULATEURS Firebase uniquement.
 *
 *   npm run emulators        (terminal 1)
 *   npm run emulators:seed   (terminal 2)
 *
 * Réinitialise l'émulateur (comptes Auth + base) puis crée : une université
 * (meta, plan standard), un admin_universite actif avec claims, une fiche
 * étudiant et une fiche enseignant avec email (sans accès de connexion :
 * à créer depuis l'interface).
 *
 * Garde-fous : projet obligatoirement « demo-* » et hôtes d'émulateurs forcés
 * AVANT l'initialisation de l'Admin SDK — ce script ne peut pas viser la
 * production.
 *
 * Namespace : l'émulateur Functions fait lire à l'Admin SDK le namespace
 * `<projectId>` (FIREBASE_CONFIG), alors que l'émulateur Database charge
 * database.rules.json sur `<projectId>-default-rtdb`. Pour que fonctions,
 * front et seed partagent les mêmes données SOUS les mêmes règles, le seed
 * utilise `<projectId>` et y charge database.rules.json. Aucun impact sur la
 * production (firebase.json inchangé, émulateur uniquement).
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as admin from 'firebase-admin'

export const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'demo-uniflow'
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(`Refusé : le seed ne s'exécute que sur un projet « demo-* » (reçu : ${PROJECT_ID}).`)
}
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000'

export const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST
export const DATABASE_EMULATOR = process.env.FIREBASE_DATABASE_EMULATOR_HOST
/** Namespace partagé par les fonctions, le front (mode émulateurs) et le seed. */
export const NAMESPACE = PROJECT_ID
export const DATABASE_URL = `https://${NAMESPACE}.firebaseio.com`

/** database.rules.json, cherché en remontant depuis ce fichier (sources ou
 * lib-test compilé). */
function rulesFile(): string {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'database.rules.json')
    if (existsSync(candidate)) return candidate
    if (path.dirname(dir) === dir) throw new Error('database.rules.json introuvable')
  }
}

/** Charge database.rules.json sur le namespace partagé (API de l'émulateur,
 * jeton « owner » propre aux émulateurs). */
export async function loadRulesIntoEmulator() {
  const res = await fetch(`http://${DATABASE_EMULATOR}/.settings/rules.json?ns=${NAMESPACE}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: readFileSync(rulesFile(), 'utf8'),
  })
  if (!res.ok) {
    throw new Error(`Chargement des règles dans l'émulateur impossible (HTTP ${res.status}).`)
  }
}

export const SEED = {
  universityId: 'universite-demo',
  admin: { uid: 'demo-admin', email: 'admin@universite-demo.test', name: 'Admin Démo' },
  studentId: 'demo-etudiant-1',
  student: { email: 'etudiant@universite-demo.test', firstName: 'Awa', lastName: 'Diallo' },
  teacherId: 'demo-enseignant-1',
  teacher: { email: 'enseignant@universite-demo.test', firstName: 'Moussa', lastName: 'Traoré' },
} as const

export function seedApp(): admin.app.App {
  return admin.apps.find((a) => a?.name === 'seed') ?? admin.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL }, 'seed')
}

async function assertEmulatorsUp() {
  try {
    await fetch(`http://${AUTH_EMULATOR}/`)
  } catch {
    throw new Error(
      `Émulateur Auth injoignable sur ${AUTH_EMULATOR}. Démarrez d'abord les émulateurs : npm run emulators`
    )
  }
}

export async function seedEmulators(opts: { adminPassword?: string } = {}) {
  await assertEmulatorsUp()
  const app = seedApp()
  const auth = app.auth()
  const db = app.database()
  const now = Date.now()
  const adminPassword =
    opts.adminPassword ?? process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString('base64url')

  // 0. Règles du projet sur le namespace partagé.
  await loadRulesIntoEmulator()

  // 1. Remise à zéro (émulateurs uniquement).
  await db.ref().set(null)
  const res = await fetch(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Réinitialisation de l'émulateur Auth impossible (HTTP ${res.status}).`)

  // 2. Université.
  const u = SEED.universityId
  await db.ref(`universities/${u}/meta`).set({
    name: 'Université Démo',
    slug: 'universite-demo',
    plan: 'standard',
    status: 'active',
    ownerUid: SEED.admin.uid,
    createdAt: now,
  })
  // Index plateforme (miroir de meta, tenu par onUniversityMetaWritten) :
  // écrit ici aussi pour ne pas dépendre du délai du déclencheur.
  await db.ref(`platform/universitiesIndex/${u}`).set({ name: 'Université Démo', plan: 'standard', status: 'active' })

  // 3. Administrateur : compte Auth + claims + profil actif.
  await auth.createUser({
    uid: SEED.admin.uid,
    email: SEED.admin.email,
    password: adminPassword,
    displayName: SEED.admin.name,
    emailVerified: true,
  })
  await auth.setCustomUserClaims(SEED.admin.uid, { role: 'admin_universite', universityId: u })
  await db.ref(`users/${SEED.admin.uid}`).set({
    uid: SEED.admin.uid,
    email: SEED.admin.email,
    name: SEED.admin.name,
    role: 'admin_universite',
    universityId: u,
    status: 'active',
    createdAt: now,
  })

  // 4. Fiches (même forme que celles créées par l'interface), sans accès.
  await db.ref(`universities/${u}/students/${SEED.studentId}`).set({
    studentNumber: 'ETU-0001',
    firstName: SEED.student.firstName,
    lastName: SEED.student.lastName,
    email: SEED.student.email,
    classId: '',
    programId: '',
    enrollmentStatus: 'enrolled',
    accountStatus: 'active',
    searchKey: `${SEED.student.lastName} ${SEED.student.firstName} etu-0001`.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  })
  await db.ref(`universities/${u}/teachers/${SEED.teacherId}`).set({
    employeeNumber: 'ENS-0001',
    firstName: SEED.teacher.firstName,
    lastName: SEED.teacher.lastName,
    email: SEED.teacher.email,
    department: 'Informatique',
    accountStatus: 'active',
    searchKey: `${SEED.teacher.lastName} ${SEED.teacher.firstName} ens-0001`.toLowerCase(),
    createdAt: now,
    updatedAt: now,
  })

  return { adminPassword }
}

if (require.main === module) {
  seedEmulators()
    .then(async ({ adminPassword }) => {
      console.log(`
✔ Émulateurs initialisés (projet ${PROJECT_ID})

  Université : ${SEED.universityId} (plan standard)
  Admin      : ${SEED.admin.email}
  Mot de passe (émulateur uniquement, régénéré à chaque seed) : ${adminPassword}
  Fiches     : étudiant ${SEED.student.email}, enseignant ${SEED.teacher.email}

  Application : http://localhost:5173 (npm run dev, VITE_USE_EMULATORS=true)
  Interface des émulateurs : http://127.0.0.1:4000
`)
      await seedApp().delete()
    })
    .catch((err: Error) => {
      console.error(`✖ ${err.message}`)
      process.exit(1)
    })
}
