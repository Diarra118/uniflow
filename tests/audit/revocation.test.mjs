// Révocation ou modification du rôle d'un utilisateur CONNECTÉ : mesure de
// la durée pendant laquelle l'ancien accès reste actif (émulateurs Auth +
// Database + Functions, Edge headless). Constat uniquement : aucune
// correction. Lancer depuis la racine : npm run test:revocation.
// Aucun token ni mot de passe affiché (seules des durées sont mesurées).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(`${PROJECT}/functions/package.json`)
const seed = require(`${PROJECT}/functions/lib-test/scripts/seedEmulators.js`)
const rulesRequire = createRequire(`${PROJECT}/rules/package.json`)
const { initializeTestEnvironment } = rulesRequire('@firebase/rules-unit-testing')
const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:5183'
const U = seed.SEED.universityId
const TOOLKIT = `http://${seed.AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`
const pw = { admin: randomBytes(12).toString('base64url'), t1: randomBytes(12).toString('base64url'), t2: randomBytes(12).toString('base64url') }
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
  await mkTeacher('rev-t1', pw.t1)
  await mkTeacher('rev-t2', pw.t2)
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

async function login(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
}
const navLinks = async (page) =>
  [...new Set((await page.locator('nav a:visible').allInnerTexts()).map((s) => s.trim()).filter(Boolean))].sort()

/** Infos du token persisté par le SDK (IndexedDB) — durées et rôle seulement. */
function tokenInfo(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('firebaseLocalStorageDb')
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve(null)
    req.onsuccess = () => {
      const all = req.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll()
      all.onsuccess = () => {
        const rec = all.result.find((r) => String(r.fbase_key).startsWith('firebase:authUser'))
        if (!rec) return resolve(null)
        const sts = rec.value.stsTokenManager
        const payload = JSON.parse(atob(sts.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        resolve({
          role: payload.role ?? null,
          lifetimeMin: Math.round((payload.exp - payload.iat) / 60),
          remainingMin: Math.round((sts.expirationTime - Date.now()) / 60000),
        })
      }
    }
  }))
}
/** Simule l'arrivée à échéance du token persisté : le SDK devra le rafraîchir.
 * Retourne false si aucun utilisateur n'est (plus) persisté. */
function expireToken(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('firebaseLocalStorageDb')
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve(false)
    req.onsuccess = () => {
      const tx = req.result.transaction('firebaseLocalStorage', 'readwrite')
      const store = tx.objectStore('firebaseLocalStorage')
      let found = false
      const all = store.getAll()
      all.onsuccess = () => {
        const rec = all.result.find((r) => String(r.fbase_key).startsWith('firebase:authUser'))
        if (!rec) return
        found = true
        rec.value.stsTokenManager.expirationTime = 0
        store.put(rec)
      }
      tx.oncomplete = () => resolve(found)
      tx.onabort = () => resolve(false)
      tx.onerror = () => reject(tx.error)
    }
  }))
}

test('1. rôle MODIFIÉ (enseignant → étudiant) : l’ancien rôle reste actif jusqu’au rafraîchissement du token', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await login(page, 'rev-t1@universite-demo.test', pw.t1)
  const before = await tokenInfo(page)
  assert.equal(before.role, 'teacher')

  // Côté serveur : nouveau rôle (claims + profil).
  await app.auth().setCustomUserClaims('rev-t1', { role: 'student', universityId: U })
  await app.database().ref('users/rev-t1/role').set('student')
  const t0 = Date.now()
  await sleep(15000)

  // Toujours enseignant : navigation, lecture de la liste, même après rechargement.
  await page.goto(`${BASE}/app/students`)
  await page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 15000 })
  await page.reload()
  await page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 15000 })
  const stillTeacher = (await navLinks(page)).includes('Étudiants')
  const afterReload = await tokenInfo(page)

  // Échéance du token simulée → rafraîchissement → nouveau rôle appliqué.
  await expireToken(page)
  await page.goto(`${BASE}/app`)
  await page.getByText('Mon dossier').first().waitFor({ timeout: 20000 })
  const refreshed = await tokenInfo(page)
  await page.goto(`${BASE}/app/students`)
  await page.getByText('Accès refusé').waitFor({ timeout: 15000 })

  report.modification = {
    tokenLifetimeMin: before.lifetimeMin,
    remainingAtLoginMin: before.remainingMin,
    oldRoleStillActiveAfterSec: Math.round((Date.now() - t0) / 1000),
    oldRoleAfterReload: afterReload.role,
    stillTeacherUi: stillTeacher,
    roleAfterTokenRefresh: refreshed.role,
  }
  assert.equal(stillTeacher, true)
  assert.equal(afterReload.role, 'teacher', 'rechargement : token mis en cache, ancien rôle')
  assert.equal(refreshed.role, 'student', 'nouveau rôle au rafraîchissement')
  await ctx.close()
})

test('2. rôle RETIRÉ + sessions révoquées (suspension) : accès conservé jusqu’à l’échéance du token', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await login(page, 'rev-t2@universite-demo.test', pw.t2)
  await page.goto(`${BASE}/app/students`)
  await page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 15000 })

  // Ce que fait onUserProfileWritten en production lors d'une suspension
  // (non déclenché par l'émulateur : appliqué directement ici).
  await app.database().ref('users/rev-t2/status').set('suspended')
  await app.auth().setCustomUserClaims('rev-t2', {})
  await app.auth().revokeRefreshTokens('rev-t2')
  const t0 = Date.now()

  // L'écouteur temps réel déjà ouvert reçoit encore les nouvelles données.
  await app.database().ref(`universities/${U}/students/rev-temoin`).set({
    studentNumber: 'ETU-REV', firstName: 'Témoin', lastName: 'Revocation', email: 'temoin@universite-demo.test',
    enrollmentStatus: 'enrolled', accountStatus: 'active', searchKey: 'revocation témoin etu-rev', createdAt: 1, updatedAt: 1,
  })
  const liveStillReceives = await page.getByText('Revocation').first().waitFor({ timeout: 10000 }).then(() => true, () => false)

  // Nouvelle lecture (autre écran), puis rechargement complet.
  await page.goto(`${BASE}/app/teachers`)
  const newReadAllowed = await page.getByText(seed.SEED.teacher.lastName).first().waitFor({ timeout: 15000 }).then(() => true, () => false)
  await sleep(15000)
  const stillReadsAfter15s = await page.goto(`${BASE}/app/students`).then(() =>
    page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 15000 }).then(() => true, () => false))
  const elapsedBeforeReloadSec = Math.round((Date.now() - t0) / 1000)

  // Rechargement complet : le SDK restaure la session depuis IndexedDB.
  await page.reload()
  await page.waitForTimeout(5000)
  const describe = async () => {
    const text = await page.locator('body').innerText().catch(() => '')
    if (page.url().endsWith('/login')) {
      return /en cours d'activation/.test(text)
        ? 'sur /login, connecté sans claims (« compte en cours d’activation »)'
        : 'déconnecté (redirigé vers /login)'
    }
    if ((await navLinks(page)).includes('Enseignants')) return 'toujours connecté en enseignant'
    if (/Accès impossible/.test(text) && /en cours d'activation/.test(text)) {
      return 'connecté sans claims : écran « Accès impossible — compte en cours d’activation », aucune donnée'
    }
    return `autre : ${new URL(page.url()).pathname}`
  }
  const afterReload = await describe()
  const tokenAfterReload = await tokenInfo(page)

  // Si la session survit au rechargement : échéance simulée du token.
  let afterTokenExpiry = 'non applicable (session déjà terminée au rechargement)'
  let tokenAfterExpiry = null
  if (await expireToken(page)) {
    await page.goto(`${BASE}/app`)
    await page.waitForTimeout(5000)
    afterTokenExpiry = await describe()
    tokenAfterExpiry = await tokenInfo(page)
  }
  // Et l'accès aux données après échéance ?
  const readsAfterExpiry = await page.goto(`${BASE}/app/students`).then(() =>
    page.getByText(seed.SEED.student.lastName).first().waitFor({ timeout: 8000 }).then(() => true, () => false))

  report.suspension = {
    liveListenerStillReceivesData: liveStillReceives,
    newReadAllowedAfterRevocation: newReadAllowed,
    stillReadsAfter15s,
    elapsedBeforeReloadSec,
    afterReload,
    persistedSessionAfterReload: tokenAfterReload ? `rôle du token : ${tokenAfterReload.role}` : 'aucune',
    afterTokenExpiry,
    tokenAfterExpiry: tokenAfterExpiry
      ? `token rafraîchi, rôle : ${tokenAfterExpiry.role ?? 'aucun'} (refresh token NON refusé par l'émulateur)`
      : 'aucune session persistée',
    readsStudentsAfterExpiry: readsAfterExpiry,
  }
  assert.equal(liveStillReceives, true, 'écouteur actif non coupé')
  assert.equal(newReadAllowed, true, 'nouvelle lecture encore autorisée')
  assert.equal(stillReadsAfter15s, true, 'accès conservé 15 s après la révocation')
  assert.ok(!afterReload.startsWith('autre') && !afterTokenExpiry.startsWith('autre'), JSON.stringify(report.suspension))
  assert.equal(readsAfterExpiry, false, 'plus aucun accès aux données après échéance du token')
  await ctx.close()
})

test('3. callable : un admin suspendu est refusé IMMÉDIATEMENT malgré un token valide', async () => {
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
  const body = await res.json()
  report.callableSuspendedAdmin = body.error?.status ?? 'ACCEPTÉ'
  assert.equal(body.error?.status, 'PERMISSION_DENIED')
  await app.database().ref(`users/${seed.SEED.admin.uid}/status`).set('active')
})

test('4. expérience (piste de correction, règles NON modifiées) : relire users/{uid}/status dans les règles', async () => {
  // Variante des règles, chargée sur un namespace d'essai séparé.
  const rules = JSON.parse(readFileSync(`${PROJECT}/database.rules.json`, 'utf8'))
  const students = rules.rules.universities.$universityId.students
  students['.read'] += " && root.child('users').child(auth.uid).child('status').val() === 'active'"
  const env = await initializeTestEnvironment({ projectId: 'demo-revocation-proposal', database: { rules: JSON.stringify(rules) } })
  try {
    await env.withSecurityRulesDisabled((c) => c.database().ref().set({
      users: { t: { role: 'teacher', universityId: 'A', status: 'active' } },
      universities: { A: { students: { s1: { firstName: 'Awa' } } } },
    }))
    const db = env.authenticatedContext('t', { role: 'teacher', universityId: 'A' }).database()
    let cancelled = null
    let firstValue = false
    const ref = db.ref('universities/A/students')
    ref.on('value', () => { firstValue = true }, (err) => { cancelled = err?.code ?? String(err) })
    await sleep(2000)
    assert.equal(firstValue, true, 'lecture autorisée tant que le statut est actif')
    await env.withSecurityRulesDisabled((c) => c.database().ref('users/t/status').set('suspended'))
    await sleep(5000)
    const newRead = await db.ref('universities/A/students').get().then(() => 'autorisée', () => 'refusée')
    report.proposalStatusCheck = {
      existingListenerCancelledAfterSuspension: cancelled !== null,
      newReadAfterSuspension: newRead,
    }
    ref.off()
    assert.equal(newRead, 'refusée', 'la suspension coupe immédiatement les nouvelles lectures')
  } finally {
    await env.cleanup()
  }
})
