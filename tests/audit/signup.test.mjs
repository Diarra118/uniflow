// Auto-inscription de bout en bout dans Edge headless, sur les émulateurs
// Auth + Database + Functions (projet demo-uniflow) :
//   inscription publique → écran d'attente → validation par l'admin →
//   reconnexion avec les droits du rôle validé ; puis un refus.
// Lancer depuis la racine : npm run test:signup. Aucun secret affiché.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(`${PROJECT}/functions/package.json`)
const seed = require(`${PROJECT}/functions/lib-test/scripts/seedEmulators.js`)
const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:5186'
const adminPassword = randomBytes(12).toString('base64url')
const STUDENT = { first: 'Lina', last: 'Koné', email: 'lina.kone@inscription.test', password: randomBytes(12).toString('base64url'), role: 'Étudiant', number: 'ETU-2026-777' }
const TEACHER = { first: 'Omar', last: 'Diop', email: 'omar.diop@inscription.test', password: randomBytes(12).toString('base64url'), role: 'Enseignant' }
const REASON = 'Aucun poste ouvert à ce nom.'
const consoleErrors = []
const report = {}
let vite, browser, app

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-uniflow')
  await seed.seedEmulators({ adminPassword })
  app = seed.seedApp()
  vite = spawn('npx vite --port 5186 --strictPort', {
    cwd: PROJECT, shell: true, env: { ...process.env, VITE_USE_EMULATORS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite ne démarre pas')), 60000)
    vite.stdout.on('data', (d) => { if (String(d).includes('5186')) { clearTimeout(t); resolve() } })
  })
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
})

after(async () => {
  await browser?.close()
  if (vite?.pid) spawn('taskkill', ['/PID', String(vite.pid), '/T', '/F'])
  await app?.delete()
  writeFileSync(new URL('signup-report.json', OUT), JSON.stringify({ ...report, consoleErrors }, null, 1))
})

async function newPage(label) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'fr-FR' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ label, text: m.text().slice(0, 300) }) })
  page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message.slice(0, 300)}` }))
  return page
}
const navLinks = async (page) =>
  [...new Set((await page.locator('nav a:visible').allInnerTexts()).map((s) => s.trim().replace(/\s+\d+$/, '')).filter(Boolean))].sort()

async function signup(page, p) {
  await page.goto(`${BASE}/login`)
  await page.getByRole('link', { name: 'Créer un compte' }).click()
  await page.waitForURL(`${BASE}/inscription`)
  await page.locator('#universityId option', { hasText: 'Université Démo' }).waitFor({ state: 'attached', timeout: 20000 })
  await page.fill('#firstName', p.first)
  await page.fill('#lastName', p.last)
  await page.fill('#email', p.email)
  await page.fill('#password', p.password)
  await page.fill('#confirmPassword', p.password)
  await page.selectOption('#universityId', { label: 'Université Démo' })
  await page.getByRole('radio', { name: p.role }).check()
  await page.getByRole('button', { name: /Envoyer ma demande/ }).click()
  await page.getByText('Votre demande est en attente de validation par votre université').waitFor({ timeout: 20000 })
}
async function login(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
}
let studentPage, teacherPage, adminPage

test('inscription : la liste des universités n’expose que le nom ; validation du formulaire', async () => {
  const page = await newPage('formulaire')
  await page.goto(`${BASE}/inscription`)
  await page.locator('#universityId option', { hasText: 'Université Démo' }).waitFor({ state: 'attached', timeout: 20000 })
  assert.deepEqual(await page.locator('#universityId option').allInnerTexts(), ['Choisissez votre université', 'Université Démo'])
  await page.getByRole('button', { name: /Envoyer ma demande/ }).click()
  const errors = await page.locator('.text-error').allInnerTexts()
  assert.ok(errors.includes('Le prénom est requis') && errors.includes('Choisissez Étudiant ou Enseignant'), JSON.stringify(errors))
  // Réponse brute de la fonction : { id, name } uniquement.
  const res = await fetch(`http://${process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001'}/demo-uniflow/europe-west1/listSignupUniversities`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: null }),
  })
  const list = (await res.json()).result.universities
  report.publicList = list
  assert.deepEqual(list, [{ id: seed.SEED.universityId, name: 'Université Démo' }])
  await page.context().close()
})

test('inscription d’un étudiant : compte sans droit, écran d’attente, aucune donnée', async () => {
  studentPage = await newPage('etudiant')
  await signup(studentPage, STUDENT)
  await studentPage.goto(`${BASE}/app/students`)
  await studentPage.getByText('Votre demande est en attente').waitFor({ timeout: 15000 })
  assert.equal(await studentPage.getByText(seed.SEED.student.lastName).count(), 0, 'aucune donnée affichée')
  const user = await app.auth().getUserByEmail(STUDENT.email)
  assert.deepEqual(user.customClaims ?? {}, {}, 'aucun claim')
  assert.equal((await app.database().ref(`users/${user.uid}`).get()).val(), null, 'aucun profil')
  const request = (await app.database().ref(`universities/${seed.SEED.universityId}/signupRequests/${user.uid}`).get()).val()
  assert.equal(request.status, 'pending')
  assert.equal(request.email, STUDENT.email)
})

test('admin : compteur, validation ; l’étudiant bascule dans son espace avec les bons droits', async () => {
  teacherPage = await newPage('enseignant')
  await signup(teacherPage, TEACHER)
  adminPage = await newPage('admin')
  await login(adminPage, seed.SEED.admin.email, adminPassword)
  await adminPage.waitForURL(`${BASE}/app`, { timeout: 20000 })
  const link = adminPage.getByRole('link', { name: /Inscriptions/ })
  await link.getByText('2').waitFor({ timeout: 15000 })
  await link.click()
  await adminPage.getByRole('row', { name: new RegExp(STUDENT.last) }).getByRole('button', { name: 'Valider' }).click()
  await adminPage.fill('#approve-number', STUDENT.number)
  await adminPage.locator('.modal-box').getByRole('button', { name: 'Valider' }).click()
  await adminPage.getByText(`Demande validée : ${STUDENT.first} ${STUDENT.last}`).waitFor({ timeout: 20000 })
  // L'étudiant resté sur l'écran d'attente obtient ses droits sans se reconnecter.
  await studentPage.getByRole('link', { name: 'Mon dossier' }).waitFor({ timeout: 30000 })
  const user = await app.auth().getUserByEmail(STUDENT.email)
  assert.deepEqual(user.customClaims, { role: 'student', universityId: seed.SEED.universityId })
})

test('reconnexion de l’étudiant validé : navigation étudiant, sa fiche, listes refusées', async () => {
  await studentPage.context().close()
  const page = await newPage('etudiant-reconnexion')
  await login(page, STUDENT.email, STUDENT.password)
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByRole('link', { name: 'Mon dossier' }).waitFor({ timeout: 15000 })
  report.studentNav = await navLinks(page)
  assert.deepEqual(report.studentNav, ['Classes', 'Cours', 'Filières', 'Mes notes', 'Mon dossier', 'Tableau de bord'])
  await page.goto(`${BASE}/app/mon-dossier`)
  await page.getByText(STUDENT.number).first().waitFor({ timeout: 15000 })
  await page.goto(`${BASE}/app/students`)
  await page.getByText('Accès refusé').waitFor({ timeout: 10000 })
  await page.context().close()
})

test('refus : motif montré au demandeur, compte désactivé, reconnexion impossible', async () => {
  await adminPage.getByRole('row', { name: new RegExp(TEACHER.last) }).getByRole('button', { name: 'Refuser' }).click()
  await adminPage.fill('#reject-reason', REASON)
  await adminPage.locator('.modal-box').getByRole('button', { name: 'Refuser' }).click()
  await adminPage.getByText(`Demande de ${TEACHER.first} ${TEACHER.last} refusée`).waitFor({ timeout: 20000 })
  await teacherPage.getByText('Demande refusée').waitFor({ timeout: 20000 })
  await teacherPage.getByText(REASON).waitFor()
  const user = await app.auth().getUserByEmail(TEACHER.email)
  assert.equal(user.disabled, true)
  assert.deepEqual(user.customClaims ?? {}, {})
  await teacherPage.getByRole('button', { name: 'Se déconnecter' }).click()
  await teacherPage.waitForURL(/\/login/)
  await login(teacherPage, TEACHER.email, TEACHER.password)
  await teacherPage.getByText(/demande d'inscription refusée/).waitFor({ timeout: 15000 })
  await teacherPage.context().close()
  // Plus aucune demande en attente : le compteur disparaît.
  await adminPage.getByRole('row', { name: new RegExp(TEACHER.last) }).getByText('Refusée').waitFor()
  assert.equal(await adminPage.getByRole('link', { name: /Inscriptions/ }).getByText(/^\d+$/).count(), 0)
  await adminPage.context().close()
})

test('aucune erreur JavaScript dans les pages de l’application', () => {
  // Erreurs attendues et gérées : 400 de la connexion refusée (compte désactivé).
  assert.deepEqual(consoleErrors.filter((e) => !/400|USER_DISABLED|user-disabled/.test(e.text)), [])
})
