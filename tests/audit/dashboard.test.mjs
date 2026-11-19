// Tableau de bord par rôle (Edge headless) contre les émulateurs Auth +
// Database (projet demo-uniflow) et `vite` en mode émulateurs.
//
// - Données : le jeu de la démo (DEMO de functions/scripts/seedDemo.ts,
//   compilé dans lib-test) écrit tel que le seed l'écrit, pour les deux
//   universités. Les chiffres attendus sont recalculés à partir de DEMO,
//   indépendamment du code de l'interface.
// - Vérifie : chiffres de l'admin, cartes visibles par rôle (et seulement
//   elles), action rapide, mise à jour en direct, aucune lecture refusée en
//   console.
// Lancer depuis la racine : npm run test:dashboard
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(`${PROJECT}/functions/package.json`)
const admin = require('firebase-admin')
const { DEMO } = require(`${PROJECT}/functions/lib-test/scripts/seedDemo.js`)
const PID = process.env.GCLOUD_PROJECT
assert.equal(PID, 'demo-uniflow', 'le frontend en mode émulateurs vise demo-uniflow')
const BASE = 'http://localhost:5182'
const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const HZ = DEMO[0]
const BB = DEMO[1]
assert.equal(HZ.id, 'universite-horizon')
const now = Date.now()
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
const emailOf = (p, u) => `${ascii(p.firstName)}.${ascii(p.lastName)}@${u.domain}`
const pw = () => randomBytes(12).toString('base64url')

/** Même structure que universityTree() du seed de démo. */
function tree(u) {
  const t0 = now - 60 * 86_400_000
  const at = (i) => t0 + i * 3_600_000
  const obj = (rows, f) => Object.fromEntries(rows.map((r, i) => [r.id, f(r, i)]))
  return {
    meta: { ...u.meta, status: 'active', ownerUid: u.admin.uid, createdAt: t0 },
    programs: obj(u.programs, ({ id: _id, ...p }, i) => ({ ...p, status: 'active', createdAt: at(i), updatedAt: at(i) })),
    classes: obj(u.classes, ({ id: _id, ...c }, i) => ({ ...c, academicYearLabel: '2026-2027', status: 'active', createdAt: at(10 + i), updatedAt: at(10 + i) })),
    courses: obj(u.courses, ({ id: _id, ...c }, i) => ({ ...c, createdAt: at(20 + i), updatedAt: at(20 + i) })),
    teachers: obj(u.teachers, (t, i) => ({
      employeeNumber: t.number, firstName: t.firstName, lastName: t.lastName, email: emailOf(t, u),
      department: t.department ?? '', accountStatus: t.accountStatus ?? 'active', ...(t.login ? { uid: `uid-${t.id}` } : {}),
      searchKey: `${t.lastName} ${t.firstName} ${t.number}`.toLowerCase(), createdAt: at(30 + i), updatedAt: at(30 + i),
    })),
    students: obj(u.students, (s, i) => ({
      studentNumber: s.number, firstName: s.firstName, lastName: s.lastName, email: emailOf(s, u),
      classId: s.classId ?? '', programId: u.classes.find((c) => c.id === s.classId)?.programId ?? '',
      enrollmentStatus: s.enrollmentStatus ?? 'enrolled', accountStatus: s.accountStatus ?? 'active',
      ...(s.login ? { uid: `uid-${s.id}` } : {}),
      searchKey: `${s.lastName} ${s.firstName} ${s.number}`.toLowerCase(), createdAt: at(50 + i), updatedAt: at(50 + i),
    })),
    ...(u.parent
      ? { parentLinks: { [u.parent.uid]: { [u.parent.childId]: { studentId: u.parent.childId, relation: u.parent.relation, authorized: true, grantedAt: at(80), grantedBy: u.admin.uid } } } }
      : {}),
  }
}

// Demandes d'inscription d'Horizon : 2 en attente, 1 refusée.
const SIGNUPS = {
  'req-1': { email: 'a@horizon.test', emailVerified: true, firstName: 'Binta', lastName: 'Sall', requestedRole: 'student', status: 'pending', createdAt: now - 3000 },
  'req-2': { email: 'b@horizon.test', emailVerified: true, firstName: 'Omar', lastName: 'Diop', requestedRole: 'teacher', status: 'pending', createdAt: now - 2000 },
  'req-3': { email: 'c@horizon.test', emailVerified: true, firstName: 'Aïda', lastName: 'Ka', requestedRole: 'student', status: 'rejected', createdAt: now - 1000 },
}

const teacherRec = HZ.teachers.find((t) => t.login)
const studentRec = HZ.students.find((s) => s.login)
const USERS = {
  admin: { uid: HZ.admin.uid, email: `admin@${HZ.domain}`, name: `${HZ.admin.firstName} ${HZ.admin.lastName}`, role: 'admin_universite', universityId: HZ.id },
  adminBaobab: { uid: BB.admin.uid, email: `admin@${BB.domain}`, name: `${BB.admin.firstName} ${BB.admin.lastName}`, role: 'admin_universite', universityId: BB.id },
  teacher: { uid: `uid-${teacherRec.id}`, email: emailOf(teacherRec, HZ), name: `${teacherRec.firstName} ${teacherRec.lastName}`, role: 'teacher', universityId: HZ.id, linkedRecordId: teacherRec.id, linkedRecordType: 'teacher' },
  student: { uid: `uid-${studentRec.id}`, email: emailOf(studentRec, HZ), name: `${studentRec.firstName} ${studentRec.lastName}`, role: 'student', universityId: HZ.id, linkedRecordId: studentRec.id, linkedRecordType: 'student' },
  parent: { uid: HZ.parent.uid, email: emailOf(HZ.parent, HZ), name: `${HZ.parent.firstName} ${HZ.parent.lastName}`, role: 'parent', universityId: HZ.id },
  superAdmin: { uid: 'dash-sa', email: 'sa@plateforme.test', name: 'Khadija Sy', role: 'super_admin_plateforme', universityId: null },
}
const pass = Object.fromEntries(Object.keys(USERS).map((k) => [k, pw()]))

let app, vite, browser
const denied = []
const pageErrors = []

before(async () => {
  const rulesRes = await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${PID}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: readFileSync(`${PROJECT}/database.rules.json`, 'utf8'),
  })
  assert.ok(rulesRes.ok, `règles non chargées (HTTP ${rulesRes.status})`)
  app = admin.initializeApp({ projectId: PID, databaseURL: `https://${PID}.firebaseio.com` }, 'dashboard')
  const db = app.database()
  await db.ref().set({
    universities: { [HZ.id]: { ...tree(HZ), signupRequests: SIGNUPS }, [BB.id]: tree(BB) },
    platform: {
      universitiesIndex: Object.fromEntries(DEMO.map((u) => [u.id, { name: u.meta.name, plan: u.meta.plan, status: 'active' }])),
    },
  })
  for (const [key, u] of Object.entries(USERS)) {
    await app.auth().createUser({ uid: u.uid, email: u.email, password: pass[key], displayName: u.name })
    await app.auth().setCustomUserClaims(u.uid, { role: u.role, ...(u.universityId ? { universityId: u.universityId } : {}) })
    await db.ref(`users/${u.uid}`).set({
      uid: u.uid, email: u.email, name: u.name, role: u.role, status: 'active', createdAt: now,
      ...(u.universityId ? { universityId: u.universityId } : {}),
      ...(u.linkedRecordId ? { linkedRecordId: u.linkedRecordId, linkedRecordType: u.linkedRecordType } : {}),
    })
  }

  vite = spawn('npx vite --port 5182 --strictPort', {
    cwd: PROJECT, shell: true, env: { ...process.env, VITE_USE_EMULATORS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite ne démarre pas')), 60000)
    vite.stdout.on('data', (d) => { if (String(d).includes('5182')) { clearTimeout(t); resolve() } })
  })
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
})

after(async () => {
  await browser?.close()
  if (vite?.pid) spawn('taskkill', ['/PID', String(vite.pid), '/T', '/F'])
  await app?.delete()
  writeFileSync(new URL('dashboard-report.json', OUT), JSON.stringify({ denied, pageErrors }, null, 1))
})

async function open(who, path = '/app', viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: 'fr-FR' })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (/permission[_ ]denied/i.test(m.text())) denied.push({ who, text: m.text().slice(0, 300) })
  })
  page.on('pageerror', (e) => pageErrors.push({ who, text: e.message.slice(0, 300) }))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', USERS[who].email)
  await page.fill('#password', pass[who])
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}${path}`, { timeout: 30000 })
  await page.locator('[data-dashboard]').waitFor({ timeout: 20000 })
  // Fin du chargement : plus aucun squelette.
  await page.waitForFunction(() => !document.querySelector('main .skeleton'), null, { timeout: 20000 })
  return { ctx, page }
}
const ids = (page, attr) => page.locator(`[${attr}]`).evaluateAll((els, a) => els.map((e) => e.getAttribute(a)).sort(), attr)
const statValue = async (page, id) => Number(await page.locator(`[data-stat="${id}"] [data-stat-value]`).innerText())

test('admin : les chiffres correspondent aux données de démo de SON université', async () => {
  const { ctx, page } = await open('admin')
  assert.equal(await page.locator('[data-dashboard]').getAttribute('data-dashboard'), 'admin')

  // En-tête : prénom, université, date du jour en français.
  await page.getByRole('heading', { name: `Bonjour, ${HZ.admin.firstName}` }).waitFor()
  await page.locator('main').getByText(HZ.meta.name).first().waitFor()
  const date = await page.getByTestId('dashboard-date').innerText()
  const expectedDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  assert.equal(date.trim().toLowerCase(), expectedDate.toLowerCase())

  // Cartes chiffrées (Baobab, présent dans la base, n'est jamais compté).
  assert.equal(await statValue(page, 'students'), HZ.students.length)
  assert.equal(await statValue(page, 'teachers'), HZ.teachers.length)
  assert.equal(await statValue(page, 'programs'), HZ.programs.length)
  assert.equal(await statValue(page, 'courses'), HZ.courses.length)
  assert.equal(await statValue(page, 'classes'), HZ.classes.length)
  const pending = Object.values(SIGNUPS).filter((r) => r.status === 'pending').length
  assert.equal(await statValue(page, 'signups'), pending)
  const signupCard = page.locator('[data-stat="signups"]')
  assert.equal(await signupCard.getAttribute('href'), '/app/inscriptions')
  await signupCard.getByText('À traiter').waitFor() // mise en avant écrite, pas seulement colorée
  assert.match(await signupCard.getAttribute('class'), /dash-highlight/)
  const enrolled = HZ.students.filter((s) => (s.enrollmentStatus ?? 'enrolled') === 'enrolled').length
  await page.locator('[data-stat="students"]').getByText(`${enrolled} inscrits`).waitFor()

  // Répartition par statut : nombres écrits dans la légende.
  for (const st of ['enrolled', 'pending', 'withdrawn', 'graduated']) {
    const n = HZ.students.filter((s) => (s.enrollmentStatus ?? 'enrolled') === st).length
    assert.equal(Number(await page.locator(`[data-status="${st}"]`).getAttribute('data-count')), n, `statut ${st}`)
  }
  await page.locator('[data-status="withdrawn"]').getByText('1 retiré').waitFor()
  await page.locator('[data-status="graduated"]').getByText('0 diplômé').waitFor()

  // Points d'attention : cours sans enseignant, enseignant inactif lié.
  const noTeacher = HZ.courses.filter((c) => !c.teacherId)
  const inactiveLinked = HZ.teachers.filter((t) => t.accountStatus === 'inactive' && HZ.courses.some((c) => c.teacherId === t.id))
  const items = page.locator('[data-testid="attention-list"] > li')
  assert.equal(await items.count(), noTeacher.length + inactiveLinked.length)
  for (const c of noTeacher) {
    const row = page.locator('[data-kind="course-without-teacher"]').filter({ hasText: c.code })
    assert.equal(await row.locator('a').getAttribute('href'), '/app/courses')
  }
  for (const t of inactiveLinked) {
    const row = page.locator('[data-kind="inactive-teacher"]').filter({ hasText: `${t.firstName} ${t.lastName}` })
    assert.equal(await row.locator('a').getAttribute('href'), `/app/teachers/${t.id}`)
  }

  // Dernières inscriptions : les 5 fiches les plus récentes, dans l'ordre.
  const latest = HZ.students.slice(-5).reverse().map((s) => `${s.firstName} ${s.lastName}`)
  const shown = await page.locator('[data-testid="latest-students"] li').evaluateAll((els) =>
    els.map((e) => e.querySelector('.font-medium').textContent.trim())
  )
  assert.deepEqual(shown, latest)

  // Mise à jour en direct : une classe active vide devient un point d'attention.
  await app.database().ref(`universities/${HZ.id}/classes/cls-vide`).set({ name: 'L3 Informatique', programId: 'prog-inf', status: 'active', createdAt: now, updatedAt: now })
  await page.locator('[data-kind="empty-class"]').filter({ hasText: 'L3 Informatique' }).waitFor({ timeout: 10000 })
  assert.equal(await statValue(page, 'classes'), HZ.classes.length + 1)
  await app.database().ref(`universities/${HZ.id}/classes/cls-vide`).remove()
  await page.locator('[data-kind="empty-class"]').waitFor({ state: 'detached', timeout: 10000 })

  // Cartes de l'admin, et seulement elles.
  assert.deepEqual(await ids(page, 'data-stat'), ['classes', 'courses', 'programs', 'signups', 'students', 'teachers'])
  assert.deepEqual(await ids(page, 'data-card'), ['attention', 'coming-soon', 'distribution', 'latest-students', 'quick-actions'])

  // Action rapide : ouvre le formulaire de création, paramètre retiré de l'URL.
  await page.getByRole('link', { name: 'Nouvel étudiant' }).click()
  await page.waitForURL(`${BASE}/app/students`, { timeout: 10000 })
  await page.locator('.modal-box').waitFor({ timeout: 10000 })
  await ctx.close()
})

test('admin d’une autre université : uniquement ses propres chiffres', async () => {
  const { ctx, page } = await open('adminBaobab')
  assert.equal(await statValue(page, 'students'), BB.students.length)
  assert.equal(await statValue(page, 'courses'), BB.courses.length)
  assert.equal(await statValue(page, 'signups'), 0)
  assert.doesNotMatch(await page.locator('[data-stat="signups"]').getAttribute('class'), /dash-highlight/)
  await page.locator('[data-stat="signups"]').getByText('Aucune demande en attente').waitFor()
  await ctx.close()
})

test('enseignant : ses cours seulement, avec filière et crédits', async () => {
  const { ctx, page } = await open('teacher')
  assert.equal(await page.locator('[data-dashboard]').getAttribute('data-dashboard'), 'teacher')
  const mine = HZ.courses.filter((c) => c.teacherId === teacherRec.id)
  assert.equal(await statValue(page, 'my-courses'), mine.length)
  assert.equal(await statValue(page, 'my-credits'), mine.reduce((s, c) => s + c.credits, 0))
  await page.getByTestId('my-courses-total').getByText(`${mine.length} cours au total`).waitFor()
  const rows = page.locator('[data-testid="my-courses"] li')
  assert.equal(await rows.count(), mine.length)
  for (const c of mine) {
    const row = rows.filter({ hasText: c.code })
    await row.getByText(HZ.programs.find((p) => p.id === c.programId).name).waitFor()
    await row.getByText(`${c.credits} crédits`).waitFor()
  }
  assert.deepEqual(await ids(page, 'data-stat'), ['my-courses', 'my-credits', 'my-programs'])
  assert.deepEqual(await ids(page, 'data-card'), ['coming-soon', 'my-courses-list'])
  await ctx.close()
})

test('étudiant : sa fiche résumée et le lien « Mon dossier »', async () => {
  const { ctx, page } = await open('student')
  assert.equal(await page.locator('[data-dashboard]').getAttribute('data-dashboard'), 'student')
  const record = page.getByTestId('my-record')
  const cls = HZ.classes.find((c) => c.id === studentRec.classId)
  await record.getByText(studentRec.number).waitFor()
  await record.getByText(HZ.programs.find((p) => p.id === cls.programId).name).waitFor()
  await record.getByText(cls.name).waitFor()
  await record.getByText('Inscrit').waitFor()
  assert.equal(await page.getByRole('link', { name: /Ouvrir mon dossier/ }).getAttribute('href'), '/app/mon-dossier')
  const programCourses = HZ.courses.filter((c) => c.programId === cls.programId)
  assert.equal(await page.locator('[data-testid="program-courses"] li').count(), programCourses.length)
  assert.equal(await page.locator('[data-stat]').count(), 0, 'aucune carte chiffrée de l’admin')
  assert.deepEqual(await ids(page, 'data-card'), ['coming-soon', 'my-record', 'program-courses'])
  await ctx.close()
})

test('parent : accueil sans donnée d’élève, enfants rattachés comptés', async () => {
  const { ctx, page } = await open('parent')
  assert.equal(await page.locator('[data-dashboard]').getAttribute('data-dashboard'), 'parent')
  await page.getByTestId('parent-children').getByText('1 enfant').waitFor()
  const child = HZ.students.find((s) => s.id === HZ.parent.childId)
  assert.equal(await page.locator('main').getByText(child.number).count(), 0, 'aucune fiche élève affichée')
  assert.equal(await page.locator('[data-stat]').count(), 0)
  assert.deepEqual(await ids(page, 'data-card'), ['coming-soon', 'parent-welcome'])
  await ctx.close()
})

test('super admin : index commercial seulement', async () => {
  const { ctx, page } = await open('superAdmin', '/app/plateforme')
  assert.equal(await page.locator('[data-dashboard]').getAttribute('data-dashboard'), 'platform')
  assert.equal(await statValue(page, 'universities'), DEMO.length)
  assert.equal(await page.locator('[data-testid="universities"] li').count(), DEMO.length)
  for (const u of DEMO) await page.locator('[data-testid="universities"]').getByText(u.meta.name).waitFor()
  assert.deepEqual(await ids(page, 'data-stat'), ['universities', 'universities-active', 'universities-paused'])
  assert.deepEqual(await ids(page, 'data-card'), ['coming-soon', 'platform-scope', 'universities-list'])
  await ctx.close()
})

test('mobile 390 px : une colonne, aucun débordement horizontal', async () => {
  const { ctx, page } = await open('admin', '/app', { width: 390, height: 844 })
  const overflow = await page.evaluate(() => document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth)
  assert.ok(overflow <= 1, `débordement de ${overflow} px`)
  const lefts = await page.locator('[data-stat]').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))])
  assert.equal(lefts.length, 1, 'cartes chiffrées sur une seule colonne')
  await ctx.close()
})

test('console : aucune lecture refusée, aucune erreur de page', () => {
  assert.deepEqual(denied, [], JSON.stringify(denied))
  assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors))
})
