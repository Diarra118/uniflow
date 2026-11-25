// Parcours Notes & examens (Edge headless) contre les émulateurs Auth +
// Database (projet demo-uniflow) et `vite` en mode émulateurs.
//
// - Données : le jeu de la démo (universityTree() de demoData.ts, examens et
//   notes compris), comptes de démo avec claims et profils actifs.
// - Parcours : l'enseignant crée un examen et saisit des notes (bornes,
//   note non vidable) ; l'étudiant les voit avec sa moyenne pondérée ;
//   l'admin corrige une note et en supprime une après confirmation ;
//   isolation (autre enseignant, admin Baobab, étudiant) ; contraste en
//   clair et en sombre ; affichage 390 px ; console sans lecture refusée.
// Lancer depuis la racine : npm run test:notes
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(`${PROJECT}/functions/package.json`)
const admin = require('firebase-admin')
const { DEMO, demoAccounts, universityTree } = require(`${PROJECT}/functions/lib-test/scripts/demoData.js`)
const PID = process.env.GCLOUD_PROJECT
assert.equal(PID, 'demo-uniflow', 'le frontend en mode émulateurs vise demo-uniflow')
const BASE = 'http://localhost:5183'
const OUT = new URL('./out/notes/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const shot = (name) => fileURLToPath(new URL(`${name}.png`, OUT))

const [HZ] = DEMO
const ACCOUNTS = demoAccounts()
const acc = (email) => ACCOUNTS.find((a) => a.email === email)
const TEACHER = 'moussa.traore@horizon.test' // INF101, INF201
const TEACHER2 = 'aminata.sow@horizon.test' // GES101
const STUDENT = 'awa.diallo@horizon.test' // etu-hz-01, filière INF
const ADMIN = 'admin@horizon.test'
const ADMIN_BB = 'admin@baobab.test'
const pass = Object.fromEntries(ACCOUNTS.map((a) => [a.email, randomBytes(12).toString('base64url')]))

const NEW_EXAM = 'Interrogation — Graphes'
let app, db, vite, browser, newExamId
const denied = []
const pageErrors = []

before(async () => {
  const rulesRes = await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.settings/rules.json?ns=${PID}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: readFileSync(`${PROJECT}/database.rules.json`, 'utf8'),
  })
  assert.ok(rulesRes.ok, `règles non chargées (HTTP ${rulesRes.status})`)
  app = admin.initializeApp({ projectId: PID, databaseURL: `https://${PID}.firebaseio.com` }, 'notes')
  db = app.database()
  const now = Date.now()
  await db.ref().set({
    universities: Object.fromEntries(DEMO.map((u) => [u.id, universityTree(u, now)])),
    platform: { universitiesIndex: Object.fromEntries(DEMO.map((u) => [u.id, { name: u.meta.name, plan: u.meta.plan, status: 'active' }])) },
  })
  for (const a of ACCOUNTS) {
    await app.auth().createUser({ uid: a.uid, email: a.email, password: pass[a.email], displayName: a.name })
    await app.auth().setCustomUserClaims(a.uid, { role: a.role, universityId: a.universityId })
    await db.ref(`users/${a.uid}`).set({
      uid: a.uid, email: a.email, name: a.name, role: a.role, universityId: a.universityId, status: 'active', createdAt: now,
      ...(a.linkedRecordId ? { linkedRecordId: a.linkedRecordId, linkedRecordType: a.linkedRecordType } : {}),
    })
  }
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
  // Arrêt synchrone : aucun serveur orphelin sur le port 5183.
  if (vite?.pid) spawnSync('taskkill', ['/PID', String(vite.pid), '/T', '/F'], { stdio: 'ignore' })
  await app?.delete()
})

async function open(email, { viewport = { width: 1440, height: 900 }, theme } = {}) {
  const ctx = await browser.newContext({ viewport, locale: 'fr-FR', reducedMotion: 'reduce' })
  if (theme) await ctx.addInitScript((t) => localStorage.setItem('uniflow-theme', t), theme)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (/permission[_ ]denied/i.test(m.text())) denied.push({ who: email, text: m.text().slice(0, 300) })
  })
  page.on('pageerror', (e) => pageErrors.push({ who: email, text: e.message.slice(0, 300) }))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('#email', email)
  await page.fill('#password', pass[email])
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/app`, { timeout: 30000 })
  await page.locator('[data-dashboard]').waitFor({ timeout: 30000 })
  return { ctx, page }
}
const settled = (page) => page.waitForFunction(() => !document.querySelector('main .skeleton'), null, { timeout: 30000 })
const statValue = async (page, id) => Number(await page.locator(`[data-stat="${id}"] [data-stat-value]`).innerText())

/** Contraste de chaque texte visible de <main> (même méthode que
 * dashboard-captures.mjs) ; textes des boutons désactivés exclus (WCAG). */
async function contrastFailures(page) {
  return page.evaluate(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const paint = (c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1) }
    const read = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
    const out = []
    const seen = new Set()
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.trim()
      const el = walker.currentNode.parentElement
      if (!text || seen.has(el)) continue
      seen.add(el)
      const st = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (st.visibility === 'hidden' || st.display === 'none' || !r.width || !r.height) continue
      if (el.closest('[aria-hidden="true"], .sr-only, [disabled], .modal')) continue
      const chain = []
      for (let e = el; e; e = e.parentElement) chain.unshift(e)
      ctx.clearRect(0, 0, 1, 1)
      paint('#fff')
      for (const e of chain) {
        const b = getComputedStyle(e).backgroundColor
        if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') paint(b)
      }
      const bg = read()
      let opacity = 1
      for (let p = el; p; p = p.parentElement) opacity *= Number(getComputedStyle(p).opacity)
      ctx.globalAlpha = opacity
      paint(st.color)
      ctx.globalAlpha = 1
      const fg = read()
      const size = parseFloat(st.fontSize)
      const large = size >= 24 || (Number(st.fontWeight) >= 700 && size >= 18.66)
      const v = ratio(fg, bg)
      if (v < (large ? 3 : 4.5)) out.push({ text: text.slice(0, 40), ratio: Math.round(v * 100) / 100 })
    }
    return out
  })
}

test('enseignant : tableau de bord, page Notes, création d’un examen, saisie des notes', async () => {
  const { ctx, page } = await open(TEACHER)
  await settled(page)
  assert.equal(await statValue(page, 'exams-to-grade'), 2) // devoir 2 d'INF101, TP d'INF201
  await page.getByRole('link', { name: 'Notes', exact: true }).click()
  await page.waitForURL(`${BASE}/app/notes`)
  await page.locator('[data-course="INF101"]').waitFor({ timeout: 30000 })
  // Ses cours seulement : INF101 et INF201, pas GES101.
  assert.deepEqual(await page.locator('[data-course]').evaluateAll((els) => els.map((e) => e.dataset.course)), ['INF101', 'INF201'])
  const inf101 = page.locator('[data-course="INF101"]')
  assert.equal(await inf101.locator('[data-exam]').count(), 3)
  await inf101.locator('[data-exam="Devoir 2 — Récursivité"]').getByText('À noter').waitFor()

  // Création d'un examen (note maximale 20 par défaut).
  await inf101.getByRole('button', { name: 'Nouvel examen' }).click()
  const modal = page.locator('.modal-box')
  assert.equal(await modal.locator('#exam-max').inputValue(), '20')
  await modal.locator('#exam-title').fill(NEW_EXAM)
  await modal.locator('#exam-type').selectOption('homework')
  await modal.locator('#exam-date').fill('2026-11-25')
  await modal.locator('#exam-coefficient').fill('1')
  await modal.getByRole('button', { name: 'Créer' }).click()
  await modal.waitFor({ state: 'detached' })
  await page.getByRole('status').getByText(`Examen « ${NEW_EXAM} » créé pour INF101.`).waitFor()
  const created = inf101.locator(`[data-exam="${NEW_EXAM}"]`)
  await created.getByText('À noter').waitFor()
  const all = (await db.ref(`universities/${HZ.id}/exams`).get()).val()
  newExamId = Object.keys(all).find((id) => all[id].title === NEW_EXAM)
  assert.ok(newExamId, 'examen créé en base')
  assert.equal(all[newExamId].createdBy, acc(TEACHER).uid)
  assert.equal(all[newExamId].maxScore, 20)

  // Saisie : une ligne par étudiant inscrit ou en attente de la filière INF.
  await created.click()
  await page.waitForURL(`${BASE}/app/notes/${newExamId}`)
  const rows = page.locator('[data-testid="grades-table"] tbody tr')
  await rows.first().waitFor()
  assert.equal(await rows.count(), 5) // etu-hz-01 à 05 ; Astou Niang (retirée) exclue
  const input = (num) => page.locator(`tr[data-student="${num}"] input`).first()
  const comment = (num) => page.locator(`tr[data-student="${num}"] input`).nth(1)
  // Hors bornes : refusé avant tout envoi.
  await input('HZ-2026-001').fill('25')
  await page.getByRole('button', { name: 'Enregistrer les notes' }).click()
  await page.locator('tr[data-student="HZ-2026-001"]').getByText('20 au plus').waitFor()
  await page.getByRole('alert').getByText("rien n'a été enregistré").waitFor()
  // Saisie valide (virgule décimale acceptée).
  await input('HZ-2026-001').fill('17,5')
  await comment('HZ-2026-001').fill('Très bonne maîtrise des parcours.')
  await input('HZ-2026-002').fill('12')
  await page.getByRole('button', { name: 'Enregistrer les notes' }).click()
  await page.getByRole('status').getByText('2 notes enregistrées.').waitFor()
  const g1 = (await db.ref(`universities/${HZ.id}/grades/${newExamId}_etu-hz-01`).get()).val()
  assert.equal(g1.value, 17.5)
  assert.equal(g1.comment, 'Très bonne maîtrise des parcours.')
  assert.equal(g1.createdBy, acc(TEACHER).uid)
  // Une note enregistrée ne peut pas être vidée.
  await input('HZ-2026-002').fill('')
  await page.getByRole('button', { name: 'Enregistrer les notes' }).click()
  await page.locator('tr[data-student="HZ-2026-002"]').getByText('Une note enregistrée ne peut pas être vidée.').waitFor()
  assert.equal((await db.ref(`universities/${HZ.id}/grades/${newExamId}_etu-hz-02/value`).get()).val(), 12)
  // Rechargement : notes relues depuis la base.
  await page.reload()
  await input('HZ-2026-001').waitFor()
  await page.waitForFunction(() => document.querySelector('tr[data-student="HZ-2026-001"] input')?.value === '17,5', null, { timeout: 20000 })
  assert.equal(await page.locator('[data-graded]').innerText(), '2 / 5')
  for (const theme of ['clair', 'sombre']) {
    if (theme === 'sombre') await page.click('button[aria-label="Changer de thème"]')
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    assert.deepEqual(await contrastFailures(page), [], `contraste saisie (${theme})`)
    await page.screenshot({ path: shot(`enseignant-saisie-${theme}`), fullPage: true })
  }
  await ctx.close()
})

test('autre enseignant : ni le cours ni l’examen d’un collègue', async () => {
  const { ctx, page } = await open(TEACHER2)
  await page.goto(`${BASE}/app/notes`)
  await page.locator('[data-course="GES101"]').waitFor({ timeout: 30000 })
  const hers = HZ.courses.filter((c) => c.teacherId === acc(TEACHER2).linkedRecordId).map((c) => c.code).sort()
  assert.deepEqual(await page.locator('[data-course]').evaluateAll((els) => els.map((e) => e.dataset.course)), hers)
  assert.ok(!hers.includes('INF101'))
  await page.goto(`${BASE}/app/notes/${newExamId}`)
  await page.getByText('Examen introuvable').waitFor({ timeout: 30000 })
  await ctx.close()
})

test('étudiant : tableau de bord, « Mes notes », moyenne pondérée, aucune page de saisie', async () => {
  const { ctx, page } = await open(STUDENT)
  await settled(page)
  const latest = page.getByTestId('latest-grades')
  await latest.getByText(NEW_EXAM).waitFor({ timeout: 30000 })
  await latest.locator('li').first().getByText('17,5').waitFor()
  await page.getByRole('link', { name: 'Mes notes', exact: true }).click()
  await page.waitForURL(`${BASE}/app/mes-notes`)
  const inf101 = page.locator('[data-course="INF101"]')
  await inf101.locator(`[data-exam="${NEW_EXAM}"] [data-score]`).getByText('17,5').waitFor({ timeout: 30000 })
  await inf101.locator('[data-exam="Devoir 2 — Récursivité"] [data-score]').getByText('/ 10').waitFor()
  // (14×1 + 12,5×2 + 8/10×20×1 + 17,5×1) / 5 = 14,5
  assert.equal((await inf101.locator('[data-average]').innerText()).replace(/\s+/g, ' '), 'Moyenne 14,5 / 20')
  // INF201 : TP non noté → pas de moyenne.
  await page.locator('[data-course="INF201"] [data-exam="TP noté — Modélisation"]').getByText('Non noté').waitFor()
  assert.match(await page.locator('[data-course="INF201"] [data-average]').innerText(), /—/)
  // Uniquement les cours de sa filière (INF).
  assert.ok(!(await page.locator('[data-course="GES101"]').count()))
  for (const theme of ['clair', 'sombre']) {
    if (theme === 'sombre') await page.click('button[aria-label="Changer de thème"]')
    await page.waitForTimeout(300)
    assert.deepEqual(await contrastFailures(page), [], `contraste Mes notes (${theme})`)
    await page.screenshot({ path: shot(`etudiant-mes-notes-${theme}`), fullPage: true })
  }
  // Pas de page de saisie pour l'étudiant.
  await page.goto(`${BASE}/app/notes`)
  await page.getByText('Accès refusé').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('[data-testid="grades-table"]').count(), 0)
  await ctx.close()
})

test('admin : lecture par cours et par examen, correction, suppression confirmée', async () => {
  const { ctx, page } = await open(ADMIN)
  await page.goto(`${BASE}/app/notes`)
  await page.locator('[data-course="GES101"]').waitFor({ timeout: 30000 })
  // Tous les cours de l'université, aucun bouton de création.
  assert.equal(await page.locator('[data-course]').count(), HZ.courses.length)
  assert.equal(await page.getByRole('button', { name: 'Nouvel examen' }).count(), 0)
  await page.locator(`[data-exam="${NEW_EXAM}"]`).click()
  await page.waitForURL(`${BASE}/app/notes/${newExamId}`)
  const awa = page.locator('tr[data-student="HZ-2026-001"]')
  await awa.locator('[data-value]').getByText('17,5').waitFor({ timeout: 30000 })
  assert.equal(await page.locator('[data-testid="grades-table"] input').count(), 0, 'lecture seule')
  // Correction.
  await awa.getByRole('button', { name: 'Corriger' }).click()
  const modal = page.locator('.modal-box')
  await modal.locator('#correct-value').fill('21')
  await modal.getByRole('button', { name: 'Enregistrer la correction' }).click()
  await modal.getByText('20 au plus').waitFor()
  await modal.locator('#correct-value').fill('18')
  await modal.locator('#correct-comment').fill('Corrigée après relecture de la copie.')
  await modal.getByRole('button', { name: 'Enregistrer la correction' }).click()
  await modal.waitFor({ state: 'detached' })
  await page.getByRole('status').getByText('Note de Awa Diallo corrigée.').waitFor()
  await awa.locator('[data-value]').getByText('18').waitFor()
  const g = (await db.ref(`universities/${HZ.id}/grades/${newExamId}_etu-hz-01`).get()).val()
  assert.equal(g.value, 18)
  assert.equal(g.updatedBy, acc(ADMIN).uid)
  assert.equal(g.createdBy, acc(TEACHER).uid, 'auteur d’origine conservé')
  // Suppression : rien sans confirmation.
  const ousmane = page.locator('tr[data-student="HZ-2026-002"]')
  await ousmane.getByRole('button', { name: /Supprimer la note/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler' }).click()
  assert.ok((await db.ref(`universities/${HZ.id}/grades/${newExamId}_etu-hz-02`).get()).exists())
  await ousmane.getByRole('button', { name: /Supprimer la note/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click()
  await page.getByRole('status').getByText('Note de Ousmane Ba supprimée.').waitFor()
  assert.ok(!(await db.ref(`universities/${HZ.id}/grades/${newExamId}_etu-hz-02`).get()).exists())
  await page.screenshot({ path: shot('admin-examen'), fullPage: true })
  await ctx.close()
})

test('étudiant : la note corrigée et la nouvelle moyenne', async () => {
  const { ctx, page } = await open(STUDENT)
  await page.goto(`${BASE}/app/mes-notes`)
  const inf101 = page.locator('[data-course="INF101"]')
  await inf101.locator(`[data-exam="${NEW_EXAM}"] [data-score]`).getByText('18').waitFor({ timeout: 30000 })
  // (14 + 25 + 16 + 18) / 5 = 14,6
  assert.equal((await inf101.locator('[data-average]').innerText()).replace(/\s+/g, ' '), 'Moyenne 14,6 / 20')
  await ctx.close()
})

test('admin Baobab : aucun cours ni examen d’Horizon', async () => {
  const { ctx, page } = await open(ADMIN_BB)
  await page.goto(`${BASE}/app/notes`)
  await page.locator('[data-course]').first().waitFor({ timeout: 30000 })
  const codes = await page.locator('[data-course]').evaluateAll((els) => els.map((e) => e.dataset.course))
  assert.deepEqual(codes.sort(), DEMO[1].courses.map((c) => c.code).sort())
  await page.goto(`${BASE}/app/notes/${newExamId}`)
  await page.getByText('Examen introuvable').waitFor({ timeout: 30000 })
  await ctx.close()
})

test('mobile 390 px, sombre : saisie et « Mes notes » sans débordement de la page', async () => {
  for (const [email, path] of [[TEACHER, `/app/notes/${newExamId}`], [STUDENT, '/app/mes-notes']]) {
    const { ctx, page } = await open(email, { viewport: { width: 390, height: 844 }, theme: 'uniflow-dark' })
    await page.goto(`${BASE}${path}`)
    await page.locator('[data-testid="grades-table"], [data-testid="my-grades"]').first().waitFor({ timeout: 30000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    assert.ok(overflow <= 1, `${path} : débordement horizontal de ${overflow} px`)
    assert.deepEqual(await contrastFailures(page), [], `contraste ${path} (mobile sombre)`)
    await page.screenshot({ path: shot(`mobile-sombre-${email.split('@')[0]}`), fullPage: true })
    await ctx.close()
  }
})

test('console : aucune lecture refusée, aucune erreur de page', () => {
  assert.deepEqual(denied, [], JSON.stringify(denied))
  assert.deepEqual(pageErrors, [], JSON.stringify(pageErrors))
})
