// Vérification de la VERSION HÉBERGÉE de démonstration (Edge headless) sur
// https://uniflow-demo-30e61.web.app, après `npm run seed:hosted`.
//
// - Comptes : lus dans docs/COMPTES-EN-LIGNE.local.md (non versionné, écrit
//   par seed:hosted) ; aucun mot de passe n'est affiché.
// - Chiffres attendus : recalculés à partir du jeu de démo (demoData.ts).
// - Vérifie : connexion de chaque compte et bon tableau de bord, aucune
//   lecture refusée ni erreur en console, aucun appel de Cloud Function,
//   isolation Baobab / Horizon (interface ET lecture directe de la base),
//   création puis modification d'une filière de test (supprimée ensuite),
//   message des fonctions désactivées, rechargement d'une route interne,
//   mode sombre et largeur mobile. Captures : tests/audit/out/en-ligne/.
// Lancer depuis la racine : npm run test:en-ligne
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(`${PROJECT}/functions/package.json`)
const { DEMO } = require(`${PROJECT}/functions/lib-test/scripts/demoData.js`)
const BASE = process.env.UNIFLOW_ONLINE_URL ?? 'https://uniflow-demo-30e61.web.app'
const OUT = new URL('./out/en-ligne/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const shot = (name) => fileURLToPath(new URL(`${name}.png`, OUT))
/** Capture après la fin des animations d'apparition des cartes. */
async function capture(page, name, opts = {}) {
  await page.waitForTimeout(900)
  await page.screenshot({ path: shot(name), ...opts })
}
const LOCAL_ONLY = 'Disponible dans la version complète, à lancer en local : voir le README.'

const [HZ, BB] = DEMO
assert.equal(HZ.id, 'universite-horizon')
assert.equal(BB.id, 'institut-baobab')

/** Configuration publique (.env.hosted) : clé d'API web et URL de la base. */
function hostedEnv() {
  const out = {}
  for (const line of readFileSync(`${PROJECT}/.env.hosted`, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0 && !line.startsWith('#')) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}
const ENV = hostedEnv()

/** Comptes du fichier local : { email: { role, password } }. */
function accounts() {
  const file = `${PROJECT}/docs/COMPTES-EN-LIGNE.local.md`
  assert.ok(existsSync(file), 'docs/COMPTES-EN-LIGNE.local.md absent : lancez npm run seed:hosted')
  const rows = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\| ([^|]+) \| [^|]+ \| `([^`]+)` \| `([^`]+)` \|/)
    if (m) rows[m[2]] = { role: m[1].trim(), password: m[3] }
  }
  return rows
}
const ACCOUNTS = accounts()
const pwd = (email) => {
  const a = ACCOUNTS[email]
  assert.ok(a, `compte ${email} absent du fichier des comptes`)
  return a.password
}

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
const emailOf = (p, u) => `${ascii(p.firstName)}.${ascii(p.lastName)}@${u.domain}`

/** Les 9 comptes de démo et le tableau de bord attendu. */
const LOGINS = DEMO.flatMap((u) => [
  { label: `admin ${u.id}`, email: `admin@${u.domain}`, dashboard: 'admin' },
  ...u.teachers.filter((t) => t.login).map((t) => ({ label: `enseignant ${t.id}`, email: emailOf(t, u), dashboard: 'teacher' })),
  ...u.students.filter((s) => s.login).map((s) => ({ label: `étudiant ${s.id}`, email: emailOf(s, u), dashboard: 'student' })),
  ...(u.parent ? [{ label: `parent ${u.id}`, email: emailOf(u.parent, u), dashboard: 'parent' }] : []),
])

let browser
const consoleIssues = []
const pageErrors = []
const functionCalls = []
const cleanup = []

before(async () => {
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
})

after(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {})
  await browser?.close()
})

/** Nouveau contexte surveillé (console, erreurs de page, appels de fonctions). */
async function newPage(who, { viewport = { width: 1440, height: 900 }, theme } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'fr-FR' })
  if (theme) await ctx.addInitScript((t) => localStorage.setItem('uniflow-theme', t), theme)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error' || /permission[_ ]denied/i.test(text)) consoleIssues.push({ who, type: m.type(), text: text.slice(0, 300) })
  })
  page.on('pageerror', (e) => pageErrors.push({ who, text: e.message.slice(0, 300) }))
  page.on('request', (r) => {
    if (/cloudfunctions\.net|\.run\.app\/|\/__\/functions/.test(r.url())) functionCalls.push({ who, url: r.url().slice(0, 200) })
  })
  return { ctx, page }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#password', pwd(email))
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  await page.locator('[data-dashboard]').waitFor({ timeout: 30000 })
  await page.waitForFunction(() => !document.querySelector('main .skeleton'), null, { timeout: 30000 })
}

const statValue = async (page, id) => Number(await page.locator(`[data-stat="${id}"] [data-stat-value]`).innerText())
/** Attend (au plus 15 s) que la liste affiche n lignes : chargement en direct. */
const rowCount = (page, n) =>
  page
    .waitForFunction((k) => document.querySelectorAll('main tbody tr').length === k, n, { timeout: 15000 })
    .catch(() => {})

/** fetch avec 3 essais sur erreur réseau (pas sur une réponse HTTP). */
async function fetchRetry(url, init) {
  for (let i = 1; ; i++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (i >= 3) throw new Error(`réseau : ${err.cause?.code ?? err.message}`)
      await new Promise((r) => setTimeout(r, 1500 * i))
    }
  }
}

/** Connexion par l'API REST d'Authentication : jeton d'identité. */
async function idToken(email) {
  const res = await fetchRetry(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${ENV.VITE_FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pwd(email), returnSecureToken: true }),
  })
  assert.equal(res.status, 200, `connexion REST de ${email}`)
  return (await res.json()).idToken
}
const dbUrl = (path, token) => `${ENV.VITE_FIREBASE_DATABASE_URL}/${path}.json?auth=${token}`

test('page de connexion : pas de « Créer un compte », message prévu à la place', async () => {
  const { ctx, page } = await newPage('anonyme')
  await page.goto(`${BASE}/login`)
  await page.getByText(LOCAL_ONLY).waitFor()
  assert.equal(await page.getByRole('link', { name: 'Créer un compte' }).count(), 0)
  await capture(page, '01-connexion')
  // Route publique d'inscription : message, aucune liste chargée.
  await page.goto(`${BASE}/inscription`)
  await page.getByText(LOCAL_ONLY).waitFor()
  assert.equal(await page.locator('form').count(), 0)
  await ctx.close()
})

for (const acc of LOGINS) {
  test(`connexion ${acc.label} : tableau de bord ${acc.dashboard}`, async () => {
    const { ctx, page } = await newPage(acc.label)
    await login(page, acc.email)
    assert.equal(await page.locator('[data-dashboard]').getAttribute('data-dashboard'), acc.dashboard)
    if (acc.email === 'admin@horizon.test') await capture(page, '02-admin-horizon')
    if (acc.email === emailOf(HZ.teachers[0], HZ)) await capture(page, '03-enseignant')
    if (acc.email === emailOf(HZ.students[0], HZ)) await capture(page, '04-etudiant')
    if (acc.email === emailOf(HZ.parent, HZ)) await capture(page, '05-parent')
    await ctx.close()
  })
}

test('admin Horizon : chiffres de SON université, demandes remplacées par le message', async () => {
  const { ctx, page } = await newPage('admin Horizon')
  await login(page, 'admin@horizon.test')
  assert.equal(await statValue(page, 'students'), HZ.students.length)
  assert.equal(await statValue(page, 'teachers'), HZ.teachers.length)
  assert.equal(await statValue(page, 'programs'), HZ.programs.length)
  assert.equal(await statValue(page, 'courses'), HZ.courses.length)
  assert.equal(await statValue(page, 'classes'), HZ.classes.length)
  const signups = page.locator('[data-stat="signups"]')
  await signups.getByText(LOCAL_ONLY).waitFor()
  assert.equal(await signups.getAttribute('href'), null, 'carte sans lien')
  assert.equal(await page.getByRole('link', { name: /^Inscriptions/ }).count(), 0, 'pas de lien « Inscriptions »')

  // Page des demandes : message, aucun bouton Valider / Refuser.
  await page.goto(`${BASE}/app/inscriptions`)
  await page.getByRole('heading', { name: "Demandes d'inscription" }).waitFor()
  await page.getByText(LOCAL_ONLY).waitFor()
  assert.equal(await page.getByRole('button', { name: /Valider|Refuser/ }).count(), 0)
  await capture(page, '06-demandes-inscription')

  // Fiche sans accès : pas de « Créer un accès de connexion ».
  const noLogin = HZ.students.find((s) => !s.login)
  await page.goto(`${BASE}/app/students/${noLogin.id}`)
  await page.getByText(noLogin.number).first().waitFor()
  await page.getByText(LOCAL_ONLY).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Créer un accès de connexion' }).count(), 0)
  await capture(page, '07-fiche-sans-acces')

  // Fiche avec accès : pas de « Renvoyer l'invitation ».
  const withLogin = HZ.students.find((s) => s.login)
  await page.goto(`${BASE}/app/students/${withLogin.id}`)
  await page.getByText('Accès créé').waitFor()
  await page.getByText(LOCAL_ONLY).waitFor()
  assert.equal(await page.getByRole('button', { name: "Renvoyer l'invitation" }).count(), 0)

  // Formulaire de création : pas de case « Créer un accès de connexion ».
  for (const list of ['students', 'teachers']) {
    await page.goto(`${BASE}/app/${list}?nouveau=1`)
    const modal = page.locator('.modal-box')
    await modal.waitFor({ timeout: 15000 }).catch(async () => {
      await page.getByRole('button', { name: /Nouvel/ }).first().click()
      await modal.waitFor()
    })
    await modal.getByTestId('login-access-local-only').getByText(LOCAL_ONLY).waitFor()
    assert.equal(await modal.locator('input[type=checkbox]').count(), 0)
    if (list === 'students') await capture(page, '08-formulaire-etudiant')
  }
  await ctx.close()
})

test('isolation : l’admin Baobab ne voit rien d’Horizon', async () => {
  const { ctx, page } = await newPage('admin Baobab')
  await login(page, 'admin@baobab.test')
  assert.equal(await statValue(page, 'students'), BB.students.length)
  assert.equal(await statValue(page, 'programs'), BB.programs.length)
  assert.equal(await statValue(page, 'courses'), BB.courses.length)
  // Marqueurs propres à Horizon : matricules HZ-*, codes et noms des
  // filières, cours et classes, noms des personnes.
  const hzMarkers = [
    'HZ-',
    HZ.meta.name,
    ...HZ.programs.flatMap((p) => [p.name, p.code]),
    ...HZ.courses.flatMap((c) => [c.name, c.code]),
    ...HZ.classes.map((c) => c.name),
    ...[...HZ.students, ...HZ.teachers].map((p) => `${p.firstName} ${p.lastName}`),
  ]
  const expectedRows = { students: BB.students.length, teachers: BB.teachers.length, programs: BB.programs.length, courses: BB.courses.length, classes: BB.classes.length }
  for (const [list, n] of Object.entries(expectedRows)) {
    await page.goto(`${BASE}/app/${list}`)
    await page.locator('main tbody tr').first().waitFor({ timeout: 30000 })
    await rowCount(page, n)
    assert.equal(await page.locator('main tbody tr').count(), n, `${list} : uniquement les lignes de Baobab`)
    const text = await page.locator('main').innerText()
    for (const m of hzMarkers) assert.ok(!text.includes(m), `${list} : « ${m} » (Horizon) ne doit pas apparaître`)
  }
  // Fiche d'Horizon par son adresse : introuvable pour Baobab.
  await page.goto(`${BASE}/app/students/${HZ.students[0].id}`)
  await page.getByText('Étudiant introuvable').waitFor({ timeout: 30000 })
  await capture(page, '09-baobab-fiche-horizon-introuvable')
  await ctx.close()

  // Lecture directe de la base avec le jeton de l'admin Baobab : refusée
  // sur Horizon, autorisée sur Baobab (contrôle positif).
  const token = await idToken('admin@baobab.test')
  for (const path of [`universities/${HZ.id}/students`, `universities/${HZ.id}/programs`, `universities/${HZ.id}/meta`, `users/${HZ.admin.uid}`]) {
    const res = await fetchRetry(dbUrl(path, token))
    assert.equal(res.status, 401, `${path} doit être refusé à l'admin Baobab`)
  }
  const own = await fetchRetry(dbUrl(`universities/${BB.id}/students`, token))
  assert.equal(own.status, 200)
  assert.equal(Object.keys(await own.json()).length, BB.students.length)
})

test('filière de test : création puis modification par l’admin, puis suppression', async () => {
  const code = `TEST${Date.now().toString().slice(-5)}`
  const name = `Filière de vérification ${code}`
  const renamed = `${name} (modifiée)`
  const token = await idToken('admin@horizon.test')
  const findTestPrograms = async () => {
    const res = await fetchRetry(dbUrl(`universities/${HZ.id}/programs`, token))
    assert.equal(res.status, 200)
    return Object.entries((await res.json()) ?? {}).filter(([, p]) => p.code === code)
  }
  cleanup.push(async () => {
    for (const [id] of await findTestPrograms()) await fetchRetry(dbUrl(`universities/${HZ.id}/programs/${id}`, token), { method: 'DELETE' })
  })

  const { ctx, page } = await newPage('admin Horizon (filière)')
  await login(page, 'admin@horizon.test')
  await page.goto(`${BASE}/app/programs`)
  await page.getByRole('button', { name: 'Nouvelle filière' }).first().click()
  const modal = page.locator('.modal-box')
  const inputs = modal.locator('input')
  await inputs.nth(0).fill(name)
  await inputs.nth(1).fill(code)
  await inputs.nth(2).fill('2')
  await modal.locator('textarea').fill('Donnée de test créée par la vérification en ligne, supprimée ensuite.')
  await modal.locator('button[type=submit]').click()
  await modal.waitFor({ state: 'detached', timeout: 20000 })
  const row = page.locator('tbody tr').filter({ hasText: code })
  await row.getByText(name, { exact: true }).waitFor({ timeout: 20000 })

  // Rechargement d'une route interne : même page, données toujours là.
  await page.reload()
  await page.waitForURL(`${BASE}/app/programs`)
  await row.getByText(name, { exact: true }).waitFor({ timeout: 30000 })

  await row.getByRole('button', { name: 'Modifier' }).click()
  await modal.waitFor()
  await inputs.nth(0).fill(renamed)
  await modal.locator('button[type=submit]').click()
  await modal.waitFor({ state: 'detached', timeout: 20000 })
  await row.getByText(renamed, { exact: true }).waitFor({ timeout: 20000 })
  await capture(page, '10-filiere-de-test')

  // Vérifiée en base, puis supprimée avec le jeton de l'admin (mêmes règles).
  const found = await findTestPrograms()
  assert.equal(found.length, 1)
  assert.equal(found[0][1].name, renamed)
  const del = await fetchRetry(dbUrl(`universities/${HZ.id}/programs/${found[0][0]}`, token), { method: 'DELETE' })
  assert.equal(del.status, 200)
  await row.waitFor({ state: 'detached', timeout: 20000 })
  assert.equal((await findTestPrograms()).length, 0, 'filière de test supprimée')
  assert.equal(await page.locator('tbody tr').count(), HZ.programs.length)
  await ctx.close()
})

test('accès direct et rechargement d’une route interne', async () => {
  const { ctx, page } = await newPage('enseignant (rechargement)')
  await login(page, emailOf(HZ.teachers[0], HZ))
  await page.goto(`${BASE}/app/courses`)
  await page.locator('tbody tr').first().waitFor({ timeout: 30000 })
  await page.reload()
  await page.waitForURL(`${BASE}/app/courses`)
  await page.locator('tbody tr').first().waitFor({ timeout: 30000 })
  await rowCount(page, HZ.courses.length)
  assert.equal(await page.locator('tbody tr').count(), HZ.courses.length)
  // Route inconnue : retour à l'accueil, pas de page 404 de l'hébergeur.
  await page.goto(`${BASE}/app/route-inexistante`)
  await page.locator('[data-dashboard]').waitFor({ timeout: 30000 })
  await ctx.close()
})

test('mode sombre et largeur mobile (390 px)', async () => {
  const { ctx, page } = await newPage('admin Horizon (mobile sombre)', { viewport: { width: 390, height: 844 }, theme: 'uniflow-dark' })
  await login(page, 'admin@horizon.test')
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'uniflow-dark')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  assert.ok(overflow <= 1, `débordement horizontal de ${overflow} px`)
  const lefts = await page.locator('[data-stat]').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().left)))])
  assert.equal(lefts.length, 1, 'cartes sur une seule colonne')
  await capture(page, '11-mobile-sombre', { fullPage: true })
  await page.goto(`${BASE}/app/programs`)
  await page.locator('main table').waitFor({ timeout: 30000 })
  await capture(page, '12-mobile-sombre-filieres')
  await ctx.close()

  const desk = await newPage('admin Horizon (sombre)', { theme: 'uniflow-dark' })
  await login(desk.page, 'admin@horizon.test')
  await capture(desk.page, '13-admin-sombre')
  await desk.ctx.close()
})

test('notes : examen créé et noté par l’enseignant, vu par l’étudiant, corrigé par l’admin, puis supprimé', async () => {
  const TEACHER = emailOf(HZ.teachers[0], HZ) // Moussa Traoré : INF101, INF201
  const STUDENT = emailOf(HZ.students[0], HZ) // Awa Diallo : filière INF
  const title = `Vérification en ligne ${Date.now().toString().slice(-5)}`
  const adminToken = await idToken('admin@horizon.test')
  const testExams = async () => {
    const res = await fetchRetry(dbUrl(`universities/${HZ.id}/exams`, adminToken))
    assert.equal(res.status, 200)
    return Object.entries((await res.json()) ?? {}).filter(([, e]) => e.title === title)
  }
  const removeTestData = async () => {
    for (const [id] of await testExams()) {
      for (const s of HZ.students) {
        await fetchRetry(dbUrl(`universities/${HZ.id}/grades/${id}_${s.id}`, adminToken), { method: 'DELETE' })
      }
      await fetchRetry(dbUrl(`universities/${HZ.id}/exams/${id}`, adminToken), { method: 'DELETE' })
    }
  }
  cleanup.push(removeTestData)

  // Enseignant : création de l'examen et saisie d'une note.
  const t = await newPage('enseignant (notes)')
  await login(t.page, TEACHER)
  assert.equal(await statValue(t.page, 'exams-to-grade'), 2)
  await t.page.goto(`${BASE}/app/notes`)
  const inf101 = t.page.locator('[data-course="INF101"]')
  await inf101.waitFor({ timeout: 30000 })
  await inf101.getByRole('button', { name: 'Nouvel examen' }).click()
  const modal = t.page.locator('.modal-box')
  await modal.locator('#exam-title').fill(title)
  await modal.locator('#exam-date').fill('2026-11-25')
  await modal.getByRole('button', { name: 'Créer' }).click()
  await modal.waitFor({ state: 'detached', timeout: 20000 })
  await inf101.locator(`[data-exam="${title}"]`).click()
  const [[examId]] = await testExams()
  await t.page.waitForURL(`${BASE}/app/notes/${examId}`)
  const awaInput = t.page.locator(`tr[data-student="${HZ.students[0].number}"] input`).first()
  await awaInput.waitFor({ timeout: 30000 })
  assert.equal(await t.page.locator('[data-testid="grades-table"] tbody tr').count(), 5)
  await awaInput.fill('15,5')
  await t.page.getByRole('button', { name: 'Enregistrer les notes' }).click()
  await t.page.getByRole('status').getByText('1 note enregistrée.').waitFor({ timeout: 20000 })
  await capture(t.page, '14-notes-saisie-enseignant')
  await t.ctx.close()

  // Étudiant : la note et la moyenne pondérée du cours.
  const s = await newPage('étudiant (notes)')
  await login(s.page, STUDENT)
  await s.page.goto(`${BASE}/app/mes-notes`)
  const course = s.page.locator('[data-course="INF101"]')
  await course.locator(`[data-exam="${title}"] [data-score]`).getByText('15,5').waitFor({ timeout: 30000 })
  // (14×1 + 12,5×2 + 8/10×20×1 + 15,5×1) / 5 = 14,1
  assert.equal((await course.locator('[data-average]').innerText()).replace(/\s+/g, ' '), 'Moyenne 14,1 / 20')
  await capture(s.page, '15-notes-etudiant')
  await s.ctx.close()

  // Admin : correction de la note.
  const a = await newPage('admin (notes)')
  await login(a.page, 'admin@horizon.test')
  await a.page.goto(`${BASE}/app/notes/${examId}`)
  const row = a.page.locator(`tr[data-student="${HZ.students[0].number}"]`)
  await row.locator('[data-value]').getByText('15,5').waitFor({ timeout: 30000 })
  await row.getByRole('button', { name: 'Corriger' }).click()
  await a.page.locator('#correct-value').fill('16')
  await a.page.getByRole('button', { name: 'Enregistrer la correction' }).click()
  await row.locator('[data-value]').getByText('16').waitFor({ timeout: 20000 })
  const graded = await (await fetchRetry(dbUrl(`universities/${HZ.id}/grades/${examId}_${HZ.students[0].id}`, adminToken))).json()
  assert.equal(graded.value, 16)
  assert.equal(graded.updatedBy, HZ.admin.uid)
  await capture(a.page, '16-notes-correction-admin')
  await a.ctx.close()

  // Données de test supprimées (note puis examen), avec le jeton de l'admin.
  await removeTestData()
  assert.equal((await testExams()).length, 0)
  const gone = await fetchRetry(dbUrl(`universities/${HZ.id}/grades/${examId}_${HZ.students[0].id}`, adminToken))
  assert.equal(await gone.json(), null)
})

test('console : aucune lecture refusée, aucune erreur, aucun appel de fonction', () => {
  assert.deepEqual(consoleIssues, [], JSON.stringify(consoleIssues))
  assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors))
  assert.deepEqual(functionCalls, [], JSON.stringify(functionCalls))
})
