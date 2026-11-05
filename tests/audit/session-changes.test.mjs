// Réaction de l'interface aux changements de /users/{uid} d'un utilisateur
// CONNECTÉ (lot 3, partie 3) : suspension / suppression → déconnexion avec
// message ; changement de rôle → renouvellement du token et interface mise à
// jour. Émulateurs Auth + Database + Functions, Edge headless.
// Lancer depuis la racine : npm run test:session. Aucun secret affiché.
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

const BASE = 'http://localhost:5185'
const U = seed.SEED.universityId
const USERS = ['s1', 's2', 's3', 's4']
const pw = Object.fromEntries(USERS.map((k) => [k, randomBytes(12).toString('base64url')]))
const report = {}
const consoleErrors = []
let vite, browser, app
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-uniflow')
  await seed.seedEmulators()
  app = seed.seedApp()
  for (const k of USERS) {
    const uid = `sess-${k}`
    await app.auth().createUser({ uid, email: `${uid}@universite-demo.test`, password: pw[k] })
    await app.auth().setCustomUserClaims(uid, { role: 'teacher', universityId: U })
    await app.database().ref(`users/${uid}`).set({ uid, email: `${uid}@universite-demo.test`, name: `Prof ${k}`, role: 'teacher', universityId: U, status: 'active', createdAt: 1 })
  }
  vite = spawn('npx vite --port 5185 --strictPort', {
    cwd: PROJECT, shell: true, env: { ...process.env, VITE_USE_EMULATORS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite ne démarre pas')), 60000)
    vite.stdout.on('data', (d) => { if (String(d).includes('5185')) { clearTimeout(t); resolve() } })
  })
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
})

after(async () => {
  await browser?.close()
  if (vite?.pid) spawn('taskkill', ['/PID', String(vite.pid), '/T', '/F'])
  await app?.delete()
  writeFileSync(new URL('session-report.json', OUT), JSON.stringify({ ...report, consoleErrors }, null, 1))
})

async function openStudents(k) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => consoleErrors.push({ k, text: e.message.slice(0, 200) }))
  await page.goto(`${BASE}/login`)
  await page.fill('#email', `sess-${k}@universite-demo.test`)
  await page.fill('#password', pw[k])
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.goto(`${BASE}/app/students`)
  await page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 15000 })
  return { ctx, page }
}
const navLinks = async (page) =>
  [...new Set((await page.locator('nav a:visible').allInnerTexts()).map((s) => s.trim()).filter(Boolean))].sort()
/** ms écoulées depuis t0 jusqu'à ce que cond() soit vraie (ou null). */
async function until(t0, cond, timeoutMs = 20000) {
  while (Date.now() - t0 < timeoutMs) {
    if (await cond().catch(() => false)) return Date.now() - t0
    await sleep(100)
  }
  return null
}

test('suspension : déconnexion immédiate avec message en français', async () => {
  const { ctx, page } = await openStudents('s1')
  const t0 = Date.now()
  // Ce que fait le déclencheur en production (non déclenché par l'émulateur).
  await app.database().ref('users/sess-s1/status').set('suspended')
  await app.auth().setCustomUserClaims('sess-s1', {})
  await app.auth().revokeRefreshTokens('sess-s1')
  const dataGoneMs = await until(t0, async () => (await page.getByText(seed.SEED.student.lastName).count()) === 0)
  const messageMs = await until(t0, async () =>
    page.url().endsWith('/login') && (await page.getByText('Votre compte a été suspendu').isVisible()))
  await page.reload()
  const messageAfterReload = await page.getByText('Votre compte a été suspendu').isVisible()
  report.suspension = { dataGoneMs, loggedOutWithMessageMs: messageMs, messageAfterReload }
  assert.ok(dataGoneMs !== null && dataGoneMs < 3000, `données masquées en ${dataGoneMs} ms`)
  assert.ok(messageMs !== null && messageMs < 3000, `déconnecté avec message en ${messageMs} ms`)
  assert.equal(messageAfterReload, true, 'message conservé après rechargement')
  await ctx.close()
})

test('profil supprimé : déconnexion avec message « Profil introuvable »', async () => {
  const { ctx, page } = await openStudents('s2')
  const t0 = Date.now()
  await app.database().ref('users/sess-s2').remove()
  const messageMs = await until(t0, async () =>
    page.url().endsWith('/login') && (await page.getByText(/Profil introuvable/).first().isVisible()))
  report.profileDeleted = { loggedOutWithMessageMs: messageMs }
  assert.ok(messageMs !== null && messageMs < 3000, `${messageMs} ms`)
  await ctx.close()
})

test('changement de rôle : token renouvelé, interface basculée vers le nouveau rôle', async () => {
  const { ctx, page } = await openStudents('s3')
  const t0 = Date.now()
  await app.database().ref('users/sess-s3/role').set('student')
  // Mesures lancées en parallèle de l'attente simulée du déclencheur.
  const dataGone = until(t0, async () => (await page.getByText(seed.SEED.student.lastName).count()) === 0)
  const newNav = until(t0, async () => (await navLinks(page)).includes('Mon dossier'))
  // Diagnostic : écran affiché chaque seconde (titres et messages, sans données).
  const timeline = []
  const tl = (async () => {
    for (let i = 0; i < 12; i++) {
      await sleep(1000)
      const txt = (await page.locator('h1, h3, [role=alert]').allInnerTexts().catch(() => [])).join(' / ')
      timeline.push(`${i + 1}s: ${txt.slice(0, 120)}`)
    }
  })()
  // En production, le déclencheur pose les nouveaux claims juste après.
  await sleep(1000)
  await app.auth().setCustomUserClaims('sess-s3', { role: 'student', universityId: U })
  const dataGoneMs = await dataGone
  const newNavMs = await newNav
  await tl
  report.roleChangeTimeline = timeline
  const nav = await navLinks(page)
  await page.goto(`${BASE}/app/students`)
  const studentsRefused = await page.getByText('Accès refusé').waitFor({ timeout: 10000 }).then(() => true, () => false)
  report.roleChange = { dataGoneMs, newRoleUiMs: newNavMs, nav, studentsRefused }
  assert.ok(dataGoneMs !== null && dataGoneMs < 3000, `données masquées en ${dataGoneMs} ms`)
  assert.ok(newNavMs !== null, 'navigation étudiant affichée')
  assert.ok(!nav.includes('Étudiants') && nav.includes('Mon dossier'), JSON.stringify(nav))
  assert.equal(studentsRefused, true)
  assert.equal(page.url().endsWith('/login'), false, 'reste connecté')
  await ctx.close()
})

test('changement de rôle sans mise à jour des claims : déconnexion après les tentatives', async () => {
  const { ctx, page } = await openStudents('s4')
  const t0 = Date.now()
  await app.database().ref('users/sess-s4/role').set('student') // claims inchangés
  const dataGoneMs = await until(t0, async () => (await page.getByText(seed.SEED.student.lastName).count()) === 0)
  const messageMs = await until(t0, async () =>
    page.url().endsWith('/login') && (await page.getByText('Vos droits ont été modifiés').isVisible()), 40000)
  report.rightsNeverUpdated = { dataGoneMs, loggedOutWithMessageMs: messageMs }
  assert.ok(dataGoneMs !== null && dataGoneMs < 3000)
  assert.ok(messageMs !== null, 'déconnecté avec message après les tentatives')
  await ctx.close()
})

test('aucune erreur JavaScript non gérée', () => {
  assert.deepEqual(consoleErrors, [])
})
