// Révocation ou modification du rôle d'un utilisateur CONNECTÉ : mesure du
// délai entre l'écriture serveur (/users/{uid}) et la perte de l'accès aux
// données, avec les règles « profil actif et conforme au token » (lot 3).
// Émulateurs Auth + Database + Functions, Edge headless.
// Lancer depuis la racine : npm run test:revocation.
// Aucun token ni mot de passe affiché (seules des durées sont mesurées).
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

const BASE = 'http://localhost:5183'
const U = seed.SEED.universityId
const TOOLKIT = `http://${seed.AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`
const pw = Object.fromEntries(['admin', 't1', 't2', 't3', 't4'].map((k) => [k, randomBytes(12).toString('base64url')]))
const report = {}
let vite, browser, app

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function mkTeacher(uid, password) {
  await app.auth().createUser({ uid, email: `${uid}@universite-demo.test`, password, displayName: uid })
  await app.auth().setCustomUserClaims(uid, { role: 'teacher', universityId: U })
  await app.database().ref(`users/${uid}`).set({ uid, email: `${uid}@universite-demo.test`, name: `Prof ${uid}`, role: 'teacher', universityId: U, status: 'active', createdAt: 1 })
}

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-uniflow')
  await seed.seedEmulators({ adminPassword: pw.admin })
  app = seed.seedApp()
  for (const k of ['t1', 't2', 't3', 't4']) await mkTeacher(`rev-${k}`, pw[k])
  vite = spawn('npx vite --port 5183 --strictPort', {
    cwd: PROJECT, shell: true, env: { ...process.env, VITE_USE_EMULATORS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('vite ne démarre pas')), 60000)
    vite.stdout.on('data', (d) => { if (String(d).includes('5183')) { clearTimeout(t); resolve() } })
  })
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
})

after(async () => {
  await browser?.close()
  if (vite?.pid) spawn('taskkill', ['/PID', String(vite.pid), '/T', '/F'])
  await app?.delete()
  writeFileSync(new URL('revocation-report.json', OUT), JSON.stringify(report, null, 1))
})

/** Enseignant connecté, sur la liste des étudiants (écouteur temps réel ouvert). */
async function openStudentsAs(uid, password) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('#email', `${uid}@universite-demo.test`)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.goto(`${BASE}/app/students`)
  await page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 15000 })
  return { ctx, page }
}
const dataVisible = async (page) => (await page.getByText(seed.SEED.student.lastName).count()) > 0

/** Délai (ms) entre l'écriture serveur et la disparition des données à l'écran. */
async function measureLoss(page, serverWrite, timeoutMs = 15000) {
  const t0 = Date.now()
  await serverWrite()
  while (Date.now() - t0 < timeoutMs) {
    if (!(await dataVisible(page))) return Date.now() - t0
    await sleep(100)
  }
  return null
}

/** Une donnée écrite APRÈS le changement atteint-elle l'écran ouvert ? (fuite) */
let sentinelSeq = 0
async function newDataReachesOpenScreen(page) {
  const lastName = `Temoin${++sentinelSeq}x`
  await app.database().ref(`universities/${U}/students/sentinel-${sentinelSeq}`).set({
    studentNumber: `S-${sentinelSeq}`, firstName: 'Témoin', lastName, email: `t${sentinelSeq}@x.test`,
    enrollmentStatus: 'enrolled', accountStatus: 'active', searchKey: lastName.toLowerCase(), createdAt: 1, updatedAt: 1,
  })
  await sleep(4000)
  return (await page.getByText(lastName).count()) > 0
}

/** Une nouvelle lecture (autre écran) affiche-t-elle des données ? */
async function newReadShowsData(page) {
  await page.goto(`${BASE}/app/teachers`).catch(() => {})
  return page.getByText(seed.SEED.teacher.lastName).first().waitFor({ timeout: 6000 }).then(() => true, () => false)
}

// Règles (lot 3, partie 2) : dès l'écriture du profil, plus AUCUNE nouvelle
// donnée n'est servie (écoute ouverte comprise) et toute nouvelle lecture est
// refusée. Les données déjà affichées restent à l'écran tant que l'interface
// ne réagit pas (requêtes limitToFirst non annulées formellement) : c'est
// l'objet de la partie 3 (dataLostAfterMs, mesuré ici).
test('1. suspension (profil suspendu + claims vidés + sessions révoquées) : plus aucune donnée servie', async () => {
  const { ctx, page } = await openStudentsAs('rev-t1', pw.t1)
  const lossMs = await measureLoss(page, async () => {
    await app.database().ref('users/rev-t1/status').set('suspended')
    await app.auth().setCustomUserClaims('rev-t1', {})
    await app.auth().revokeRefreshTokens('rev-t1')
  }, 5000)
  report.suspension = {
    newDataReachesOpenScreen: await newDataReachesOpenScreen(page),
    newReadShowsData: await newReadShowsData(page),
    displayedDataClearedAfterMs: lossMs,
  }
  assert.equal(report.suspension.newDataReachesOpenScreen, false, 'aucune nouvelle donnée sur l’écran ouvert')
  assert.equal(report.suspension.newReadShowsData, false, 'nouvelle lecture refusée')
  await ctx.close()
})

test('2. changement de rôle (profil + claims enseignant → étudiant) : ancien accès retiré immédiatement', async () => {
  const { ctx, page } = await openStudentsAs('rev-t2', pw.t2)
  const lossMs = await measureLoss(page, async () => {
    await app.database().ref('users/rev-t2/role').set('student')
    await app.auth().setCustomUserClaims('rev-t2', { role: 'student', universityId: U })
  }, 5000)
  report.roleChange = {
    newDataReachesOpenScreen: await newDataReachesOpenScreen(page),
    newReadShowsData: await newReadShowsData(page),
    displayedDataClearedAfterMs: lossMs,
  }
  assert.equal(report.roleChange.newDataReachesOpenScreen, false)
  assert.equal(report.roleChange.newReadShowsData, false)
  await ctx.close()
})

test('3. profil supprimé : accès coupé immédiatement', async () => {
  const { ctx, page } = await openStudentsAs('rev-t3', pw.t3)
  const lossMs = await measureLoss(page, () => app.database().ref('users/rev-t3').remove())
  report.profileDeleted = { dataLostAfterMs: lossMs }
  assert.notEqual(lossMs, null)
  assert.ok(lossMs < 10000, `délai ${lossMs} ms`)
  await ctx.close()
})

test('4. non-régression : un enseignant actif inchangé garde ses données', async () => {
  const { ctx, page } = await openStudentsAs('rev-t4', pw.t4)
  await sleep(5000)
  report.activeUnchanged = {
    stillSeesData: await dataVisible(page),
    // Contrôle positif du test de fuite : un utilisateur actif reçoit bien
    // la fiche témoin sur son écran ouvert.
    newDataReachesOpenScreen: await newDataReachesOpenScreen(page),
    newReadShowsData: await newReadShowsData(page),
  }
  assert.equal(report.activeUnchanged.stillSeesData, true)
  assert.equal(report.activeUnchanged.newDataReachesOpenScreen, true, 'contrôle positif')
  assert.equal(report.activeUnchanged.newReadShowsData, true)
  await ctx.close()
})

test('5. callable : un admin suspendu est refusé immédiatement malgré un token valide', async () => {
  const r = await fetch(`${TOOLKIT}/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: seed.SEED.admin.email, password: pw.admin, returnSecureToken: true }),
  })
  const { idToken } = await r.json()
  await app.database().ref(`users/${seed.SEED.admin.uid}/status`).set('suspended')
  const res = await fetch(`http://127.0.0.1:5001/${seed.PROJECT_ID}/europe-west1/createUserAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data: { role: 'teacher', linkedRecordType: 'teacher', linkedRecordId: seed.SEED.teacherId } }),
  })
  report.callableSuspendedAdmin = (await res.json()).error?.status ?? 'ACCEPTÉ'
  assert.equal(report.callableSuspendedAdmin, 'PERMISSION_DENIED')
  await app.database().ref(`users/${seed.SEED.admin.uid}/status`).set('active')
})
