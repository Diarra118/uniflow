// Parcours de bout en bout dans le navigateur (Edge headless), sur les
// émulateurs Auth + Database + Functions (projet demo-uniflow) :
//   l'admin crée un enseignant et un étudiant DEPUIS L'INTERFACE (case
//   « Créer un accès de connexion ») → claims attribués par createUserAccount
//   → chaque compte ouvre son lien d'invitation, définit son mot de passe, se
//   connecte et arrive sur le bon écran avec les bons droits.
// Lancer depuis la racine : npm run test:e2e. Aucun lien ni mot de passe affiché.
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
// Seed du projet (compilé par `npm --prefix functions run build:test`).
const seed = require(`${PROJECT}/functions/lib-test/scripts/seedEmulators.js`)
const OUT = new URL('./out/', import.meta.url)
mkdirSync(OUT, { recursive: true })

const BASE = 'http://localhost:5182'
const AUTH = seed.AUTH_EMULATOR
const adminPassword = randomBytes(12).toString('base64url')
const NEW = {
  student: { firstName: 'Lina', lastName: 'Koné', number: 'ETU-0099', email: 'lina.kone@universite-demo.test' },
  teacher: { firstName: 'Ibrahim', lastName: 'Sow', number: 'ENS-0042', email: 'ibrahim.sow@universite-demo.test' },
}
const passwords = { student: randomBytes(12).toString('base64url'), teacher: randomBytes(12).toString('base64url') }
const consoleErrors = []
const linkMode = {}
let vite, browser

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-uniflow')
  await seed.seedEmulators({ adminPassword })
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
  await seed.seedApp().delete()
  writeFileSync(new URL('e2e-report.json', OUT), JSON.stringify({ consoleErrors, linkMode }, null, 1))
})

async function newPage(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'fr-FR' })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push({ label, text: m.text().slice(0, 300) }) })
  page.on('pageerror', (e) => consoleErrors.push({ label, text: `pageerror: ${e.message.slice(0, 300)}` }))
  return { ctx, page }
}
async function login(page, email, password) {
  await page.goto(`${BASE}/login`)
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
}
const navLinks = async (page) =>
  [...new Set((await page.locator('nav a:visible').allInnerTexts()).map((s) => s.trim()).filter(Boolean))].sort()

/** Crée une fiche depuis le formulaire, avec la case « Créer un accès de connexion ». */
async function createFromUi(page, kind) {
  const p = NEW[kind]
  await page.goto(`${BASE}/app/${kind === 'student' ? 'students' : 'teachers'}`)
  await page.getByRole('button', { name: kind === 'student' ? 'Nouvel étudiant' : 'Nouvel enseignant' }).first().click()
  const inputs = page.locator('.modal-box input:not([type=checkbox])')
  await inputs.nth(0).fill(p.firstName)
  await inputs.nth(1).fill(p.lastName)
  await inputs.nth(2).fill(p.number)
  await inputs.nth(3).fill(p.email)
  await page.locator('.modal-box input[type=checkbox]').check()
  await page.getByRole('button', { name: 'Créer', exact: true }).click()
  await page.getByText('Accès de connexion créé').waitFor({ timeout: 30000 })
  await page.getByText(`Invitation envoyée à ${p.email}`).waitFor()
  await page.getByRole('button', { name: 'Fermer' }).click()
}

/** Ouvre le lien d'invitation (jamais affiché) et définit le mot de passe. */
async function acceptInvitation(kind) {
  const res = await fetch(`http://${AUTH}/emulator/v1/projects/${seed.PROJECT_ID}/oobCodes`)
  const codes = (await res.json()).oobCodes.filter((c) => c.email === NEW[kind].email && c.requestType === 'PASSWORD_RESET')
  assert.equal(codes.length, 1, `une invitation pour ${kind}`)
  // La page d'action de l'émulateur Auth n'a pas de formulaire : elle prend le
  // nouveau mot de passe en paramètre `newPassword` (fonctionnement documenté
  // par l'émulateur). En production, c'est la page Firebase qui le demande.
  const { ctx, page } = await newPage(`invitation-${kind}`)
  const res2 = await page.goto(`${codes[0].oobLink}&newPassword=${encodeURIComponent(passwords[kind])}`)
  const body = await page.locator('body').innerText()
  assert.ok(res2 && res2.status() < 400 && !/"error"/.test(body), `invitation ${kind} acceptée (HTTP ${res2?.status()})`)
  linkMode[kind] = `page d'action de l'émulateur ouverte dans le navigateur (HTTP ${res2.status()})`
  await ctx.close()
}

test('admin : crée un étudiant et un enseignant depuis l’interface, invitations envoyées', async () => {
  const { ctx, page } = await newPage('admin')
  await login(page, seed.SEED.admin.email, adminPassword)
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await createFromUi(page, 'student')
  await createFromUi(page, 'teacher')
  // La fiche du nouvel étudiant affiche l'accès créé.
  await page.goto(`${BASE}/app/students`)
  await page.getByRole('row', { name: new RegExp(NEW.student.lastName) }).getByRole('link', { name: 'Voir le profil' }).click()
  await page.getByText('Accès créé').waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: "Renvoyer l'invitation" }).waitFor()
  await ctx.close()
})

test('claims attribués côté serveur et fiches liées', async () => {
  const app = seed.seedApp()
  for (const [kind, role] of [['student', 'student'], ['teacher', 'teacher']]) {
    const user = await app.auth().getUserByEmail(NEW[kind].email)
    assert.deepEqual(user.customClaims, { role, universityId: seed.SEED.universityId }, kind)
    assert.equal(user.displayName, `${NEW[kind].firstName} ${NEW[kind].lastName}`)
    const profile = (await app.database().ref(`users/${user.uid}`).get()).val()
    assert.equal(profile.status, 'active')
    const coll = kind === 'student' ? 'students' : 'teachers'
    const rec = (await app.database().ref(`universities/${seed.SEED.universityId}/${coll}/${profile.linkedRecordId}`).get()).val()
    assert.equal(rec.uid, user.uid, 'fiche liée au compte')
    assert.equal(rec.email, NEW[kind].email)
  }
})

test('chaque compte définit son mot de passe via son lien d’invitation', async () => {
  await acceptInvitation('student')
  await acceptInvitation('teacher')
})

test('étudiant : connexion → tableau de bord, « Mon dossier », liste refusée', async () => {
  const { ctx, page } = await newPage('student')
  await login(page, NEW.student.email, passwords.student)
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByText(`${NEW.student.firstName} ${NEW.student.lastName}`).first().waitFor()
  assert.deepEqual(await navLinks(page), ['Classes', 'Cours', 'Filières', 'Mon dossier', 'Tableau de bord'].sort())
  await page.goto(`${BASE}/app/mon-dossier`)
  await page.getByText(NEW.student.number).first().waitFor({ timeout: 15000 })
  await page.goto(`${BASE}/app/students`)
  await page.getByText('Accès refusé').waitFor()
  await page.goto(`${BASE}/app/teachers`)
  await page.getByText('Accès refusé').waitFor()
  await ctx.close()
})

test('enseignant : connexion → tableau de bord, lecture des listes sans création', async () => {
  const { ctx, page } = await newPage('teacher')
  await login(page, NEW.teacher.email, passwords.teacher)
  await page.waitForURL(`${BASE}/app`, { timeout: 20000 })
  await page.getByText(`${NEW.teacher.firstName} ${NEW.teacher.lastName}`).first().waitFor()
  assert.deepEqual(await navLinks(page), ['Classes', 'Cours', 'Enseignants', 'Filières', 'Tableau de bord', 'Étudiants'].sort())
  await page.goto(`${BASE}/app/students`)
  await page.getByText(NEW.student.lastName).first().waitFor({ timeout: 15000 })
  assert.equal(await page.getByRole('button', { name: 'Nouvel étudiant' }).count(), 0)
  await page.goto(`${BASE}/app/plateforme`)
  await page.getByText('Accès refusé').waitFor()
  await page.goto(`${BASE}/app/mon-dossier`)
  await page.getByText('Accès refusé').waitFor()
  await ctx.close()
})

test('aucune erreur dans la console sur les pages de l’application', () => {
  // Les pages d'action de l'émulateur Auth (étiquettes invitation-*) ne font
  // pas partie de l'application : leurs éventuelles erreurs sont rapportées
  // dans out/e2e-report.json mais pas comptées ici.
  assert.deepEqual(consoleErrors.filter((e) => !e.label.startsWith('invitation-')), [])
})
