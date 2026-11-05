// Audit UI (shell, auth, RBAC de navigation, thème, langue, console) dans
// Edge headless, contre les émulateurs Auth + Database (projet demo-uniflow)
// et `vite` en mode émulateurs. Aucune donnée réelle, aucun secret affiché.
// Lancer depuis la racine : npm run test:audit:ui (navigateur : Edge par
// défaut, AUDIT_BROWSER_CHANNEL=chrome pour Chrome).
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
const PID = process.env.GCLOUD_PROJECT
assert.equal(PID, 'demo-uniflow', 'le frontend en mode émulateurs vise demo-uniflow')
const BASE = 'http://localhost:5181'
const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })

let app, vite, browser
const pw = Object.fromEntries(['admin', 'teacher', 'student', 'parent', 'superAdmin', 'noClaims', 'noProfile'].map((k) => [k, randomBytes(12).toString('base64url')]))
const consoleErrors = []
const englishHits = []
const ENGLISH = /\b(Loading|Sign ?in|Log ?in|Log ?out|Logout|Submit|Cancel|Password|Dashboard|Settings|Search|Save|Delete|Welcome|Not found|Forgot|Students|Teachers|Courses|Home|Profile|Back to|Something went wrong|Error)\b/

const USERS = {
  admin: { uid: 'ui-admin', email: 'admin@ui.test', claims: { role: 'admin_universite', universityId: 'A' } },
  teacher: { uid: 'ui-teacher', email: 'prof@ui.test', claims: { role: 'teacher', universityId: 'A' } },
  student: { uid: 'ui-student', email: 'etu@ui.test', claims: { role: 'student', universityId: 'A' }, linkedRecordId: 'a1' },
  parent: { uid: 'ui-parent', email: 'parent@ui.test', claims: { role: 'parent', universityId: 'A' } },
  superAdmin: { uid: 'ui-sa', email: 'sa@ui.test', claims: { role: 'super_admin_plateforme' } },
  noClaims: { uid: 'ui-noclaims', email: 'sansclaims@ui.test', claims: null },
  noProfile: { uid: 'ui-noprofile', email: 'sansprofil@ui.test', claims: { role: 'teacher', universityId: 'A' }, noProfile: true },
}

before(async () => {
  // Même namespace que le front en mode émulateurs (`<projectId>`), avec les
  // règles du projet chargées dessus (comme le fait le seed).
  const rulesRes = await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${PID}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: readFileSync(`${PROJECT}/database.rules.json`, 'utf8'),
  })
  assert.ok(rulesRes.ok, `règles non chargées (HTTP ${rulesRes.status})`)
  app = admin.initializeApp({ projectId: PID, databaseURL: `https://${PID}.firebaseio.com` }, 'ui')
  const db = app.database()
  await db.ref().set({
    universities: {
      A: {
        meta: { name: 'Université Audit A', slug: 'a', plan: 'standard', status: 'active', ownerUid: 'ui-admin', createdAt: 1 },
        students: { a1: { studentNumber: 'ETU-1', firstName: 'Awa', lastName: 'Diallo', email: 'etu@ui.test', enrollmentStatus: 'enrolled', accountStatus: 'active', searchKey: 'diallo awa etu-1', uid: 'ui-student', createdAt: 1, updatedAt: 1 } },
        teachers: { t1: { employeeNumber: 'ENS-1', firstName: 'Moussa', lastName: 'Traoré', email: 'm@ui.test', accountStatus: 'active', searchKey: 'traoré moussa ens-1', createdAt: 1, updatedAt: 1 } },
        programs: { p1: { name: 'Informatique', code: 'INF', status: 'active', createdAt: 1, updatedAt: 1 } },
      },
    },
    platform: { universitiesIndex: { A: { name: 'Université Audit A', plan: 'standard', status: 'active' } } },
  })
  for (const [key, u] of Object.entries(USERS)) {
    await app.auth().createUser({ uid: u.uid, email: u.email, password: pw[key], displayName: key })
    if (u.claims) await app.auth().setCustomUserClaims(u.uid, u.claims)
    if (u.claims && !u.noProfile) {
      await db.ref(`users/${u.uid}`).set({
        uid: u.uid, email: u.email, name: `Audit ${key}`, role: u.claims.role,
        universityId: u.claims.universityId ?? null, status: 'active', createdAt: 1,
        ...(u.linkedRecordId ? { linkedRecordId: u.linkedRecordId, linkedRecordType: 'student' } : {}),
      })
    }
  }

  vite = spawn('npx vite --port 5181 --strictPort', {
    cwd: PROJECT, shell: true, env: { ...process.env, VITE_USE_EMULATORS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite ne démarre pas')), 60000)
    vite.stdout.on('data', (d) => { if (String(d).includes('5181')) { clearTimeout(t); resolve() } })
  })
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
})

after(async () => {
  await browser?.close()
  if (vite?.pid) spawn('taskkill', ['/PID', String(vite.pid), '/T', '/F'])
  await app?.delete()
  writeFileSync(new URL('ui-report.json', OUT), JSON.stringify({ consoleErrors, englishHits }, null, 1))
})

async function newPage(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ label, text: m.text().slice(0, 300) }) })
  page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message.slice(0, 300)}` }))
  return { ctx, page }
}
async function checkFrench(page, label) {
  const text = await page.locator('body').innerText()
  const m = text.match(ENGLISH)
  if (m) englishHits.push({ label, url: page.url(), word: m[0] })
}
async function login(page, who, password = pw[who]) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', USERS[who].email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
}
const navLinks = async (page) =>
  [...new Set((await page.locator('nav a:visible').allInnerTexts()).map((s) => s.trim()).filter(Boolean))].sort()
async function expectDenied(page, path) {
  await page.goto(`${BASE}${path}`)
  await page.getByText('Accès refusé').waitFor({ timeout: 10000 })
}

test('routes protégées : visiteur redirigé vers /login', async () => {
  const { ctx, page } = await newPage('anon')
  for (const p of ['/app', '/app/students', '/app/plateforme', '/', '/inexistant']) {
    await page.goto(`${BASE}${p}`)
    await page.waitForURL(/\/login$/, { timeout: 15000 })
  }
  await checkFrench(page, 'login')
  await page.goto(`${BASE}/mot-de-passe-oublie`)
  await checkFrench(page, 'mot de passe oublié')
  await ctx.close()
})

test('connexion : échec avec un mauvais mot de passe', async () => {
  const { ctx, page } = await newPage('login-fail')
  await login(page, 'admin', 'mauvais-mot-de-passe')
  await page.getByText('Email ou mot de passe incorrect.').waitFor({ timeout: 15000 })
  assert.match(page.url(), /\/login$/)
  await ctx.close()
})

test('connexion admin, persistance après rechargement et nouvel onglet, thème, déconnexion', async () => {
  const { ctx, page } = await newPage('admin')
  await login(page, 'admin')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByText('Audit admin').first().waitFor()
  assert.deepEqual(await navLinks(page), ['Classes', 'Cours', 'Enseignants', 'Filières', 'Tableau de bord', 'Étudiants'].sort())
  await checkFrench(page, 'dashboard admin')

  // Persistance de session.
  await page.reload()
  await page.getByText('Audit admin').first().waitFor({ timeout: 15000 })
  assert.equal(page.url(), `${BASE}/app`)
  const tab2 = await ctx.newPage()
  await tab2.goto(`${BASE}/app/students`)
  await tab2.getByText('Diallo').first().waitFor({ timeout: 15000 })
  await checkFrench(tab2, 'liste étudiants (admin)')
  await tab2.close()

  // Thème clair/sombre + persistance.
  const theme0 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  await page.click('button[aria-label="Changer de thème"]')
  const theme1 = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  assert.notEqual(theme1, theme0)
  await page.screenshot({ path: fileURLToPath(new URL('ui-dashboard-' + theme1 + '.png', OUT)) })
  await page.reload()
  await page.getByText('Audit admin').first().waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), theme1, 'thème conservé après rechargement')
  assert.equal(await page.evaluate(() => localStorage.getItem('uniflow-theme')), theme1)
  const bgApp = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  // Accès hors rôle.
  await expectDenied(page, '/app/plateforme')

  // Déconnexion.
  await page.goto(`${BASE}/app`)
  await page.locator('.dropdown > button').click()
  await page.getByText('Se déconnecter').click()
  await page.waitForURL(/\/login$/, { timeout: 15000 })
  await page.goto(`${BASE}/app`)
  await page.waitForURL(/\/login$/, { timeout: 15000 })

  // Thème sur la page publique après rechargement.
  await page.reload()
  await page.locator('#email').waitFor()
  const loginTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  const bgLogin = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  writeFileSync(new URL('ui-theme.json', OUT), JSON.stringify({ theme0, theme1, loginThemeAfterReload: loginTheme, bgApp, bgLogin }))
  await page.screenshot({ path: fileURLToPath(new URL('ui-login-after-reload.png', OUT)) })
  await ctx.close()
})

test('enseignant : navigation et lecture de la liste des étudiants', async () => {
  const { ctx, page } = await newPage('teacher')
  await login(page, 'teacher')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByText('Audit teacher').first().waitFor()
  assert.deepEqual(await navLinks(page), ['Classes', 'Cours', 'Enseignants', 'Filières', 'Tableau de bord', 'Étudiants'].sort())
  await page.goto(`${BASE}/app/students`)
  await page.getByText('Diallo').first().waitFor({ timeout: 15000 })
  assert.equal(await page.getByRole('button', { name: /Nouvel étudiant/ }).count(), 0, 'pas de bouton de création')
  await expectDenied(page, '/app/plateforme')
  await ctx.close()
})

test('étudiant : « Mon dossier » seulement, liste des étudiants refusée', async () => {
  const { ctx, page } = await newPage('student')
  await login(page, 'student')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByText('Audit student').first().waitFor()
  assert.deepEqual(await navLinks(page), ['Classes', 'Cours', 'Filières', 'Mon dossier', 'Tableau de bord'].sort())
  await page.goto(`${BASE}/app/mon-dossier`)
  await page.getByText('Awa Diallo').first().waitFor({ timeout: 15000 })
  await checkFrench(page, 'mon dossier')
  await expectDenied(page, '/app/students')
  await expectDenied(page, '/app/teachers')
  await ctx.close()
})

test('parent : tableau de bord seul, sections pédagogiques refusées', async () => {
  const { ctx, page } = await newPage('parent')
  await login(page, 'parent')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByText('Audit parent').first().waitFor()
  assert.deepEqual(await navLinks(page), ['Tableau de bord'])
  await expectDenied(page, '/app/students')
  await expectDenied(page, '/app/programs')
  await ctx.close()
})

test('super_admin : redirigé vers l’espace plateforme, aucune section pédagogique', async () => {
  const { ctx, page } = await newPage('superAdmin')
  await login(page, 'superAdmin')
  await page.waitForURL(`${BASE}/app/plateforme`, { timeout: 20000 })
  assert.deepEqual(await navLinks(page), ['Espace plateforme'])
  await checkFrench(page, 'espace plateforme')
  await page.goto(`${BASE}/app`)
  await page.waitForURL(`${BASE}/app/plateforme`, { timeout: 15000 })
  await expectDenied(page, '/app/students')
  await ctx.close()
})

test('utilisateur sans claims : bloqué avec « compte en cours d’activation » et bouton Réessayer', async () => {
  const { ctx, page } = await newPage('noClaims')
  await login(page, 'noClaims')
  await page.getByText(/en cours d'activation/).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Réessayer' }).waitFor()
  await page.goto(`${BASE}/app`)
  await page.getByText(/en cours d'activation/).first().waitFor({ timeout: 15000 })
  assert.equal(await page.locator('nav a:visible').count(), 0, 'aucune navigation applicative')
  await ctx.close()
})

test('claims sans profil /users : « Profil introuvable »', async () => {
  const { ctx, page } = await newPage('noProfile')
  await login(page, 'noProfile')
  await page.getByText(/Profil introuvable/).first().waitFor({ timeout: 15000 })
  await page.goto(`${BASE}/app`)
  await page.getByText(/Profil introuvable/).first().waitFor({ timeout: 15000 })
  await ctx.close()
})
