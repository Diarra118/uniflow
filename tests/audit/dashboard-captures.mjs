// Captures du tableau de bord de chaque rôle (clair, sombre, mobile 390 px)
// contre la démo locale déjà lancée (`npm run demo`, émulateurs uniquement).
//
//   node tests/audit/dashboard-captures.mjs <dossier> [--contrast]
//
// - Comptes : lus dans docs/COMPTES-DEMO.local.md (jamais affichés).
// - Super admin : la démo n'en a pas ; un compte temporaire est créé dans
//   l'émulateur Auth pour la capture puis supprimé à la fin.
// - --contrast : mesure le contraste de chaque texte visible de la zone de
//   contenu (couleurs calculées par le navigateur, fonds composés) et écrit
//   contrast.json dans le dossier de sortie.
// - --only=admin,parent : limite les captures à ces rôles.
// - Les lectures refusées (permission_denied) remontées en console sont
//   relevées dans console.json ; le script échoue s'il y en a.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { chromium } from 'playwright-core'

const PROJECT = fileURLToPath(new URL('../..', import.meta.url))
const BASE = process.env.DEMO_URL ?? 'http://localhost:5173'
const outArg = process.argv[2]
if (!outArg) {
  console.error('Usage : node tests/audit/dashboard-captures.mjs <dossier> [--contrast]')
  process.exit(1)
}
const OUT = path.resolve(PROJECT, outArg)
const CONTRAST = process.argv.includes('--contrast')
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')
mkdirSync(OUT, { recursive: true })

// Comptes de démo (Université Horizon) : e-mail → mot de passe.
const accountsMd = readFileSync(path.join(PROJECT, 'docs', 'COMPTES-DEMO.local.md'), 'utf8')
function passwordOf(email) {
  const line = accountsMd.split('\n').find((l) => l.includes(`\`${email}\``))
  const m = line?.match(/\|\s*`[^`]+`\s*\|\s*`([^`]+)`\s*\|/)
  if (!m) throw new Error(`Compte de démo introuvable : ${email}`)
  return m[1]
}

// Super admin temporaire (émulateurs uniquement).
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
process.env.FIREBASE_DATABASE_EMULATOR_HOST ??= '127.0.0.1:9000'
const require = createRequire(path.join(PROJECT, 'functions', 'package.json'))
const admin = require('firebase-admin')
const PID = 'demo-uniflow'
const app = admin.initializeApp({ projectId: PID, databaseURL: `https://${PID}.firebaseio.com` }, 'captures')
const SA = { uid: 'capture-super-admin', email: 'capture-sa@plateforme.test', password: randomBytes(12).toString('base64url') }

const ROLES = [
  { key: 'admin', email: 'admin@horizon.test', path: '/app' },
  { key: 'enseignant', email: 'moussa.traore@horizon.test', path: '/app' },
  { key: 'etudiant', email: 'awa.diallo@horizon.test', path: '/app' },
  { key: 'parent', email: 'mamadou.diallo@horizon.test', path: '/app' },
  { key: 'super-admin', email: SA.email, password: SA.password, path: '/app/plateforme' },
]
const VIEWS = [
  { suffix: 'clair', theme: 'uniflow-light', viewport: { width: 1440, height: 900 } },
  { suffix: 'sombre', theme: 'uniflow-dark', viewport: { width: 1440, height: 900 } },
  { suffix: 'mobile-clair', theme: 'uniflow-light', viewport: { width: 390, height: 844 } },
  { suffix: 'mobile-sombre', theme: 'uniflow-dark', viewport: { width: 390, height: 844 } },
]

const denied = []
const contrast = {}

/** Contraste de chaque texte visible de <main> : couleur et fonds calculés
 * par le navigateur (oklch, color-mix compris) rendus sur un canevas 1×1. */
async function measureContrast(page) {
  return page.evaluate(() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    const paint = (color) => {
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
    }
    const read = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    const lum = ([r, g, b]) => {
      const f = (c) => {
        c /= 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x + 0.05) / (y + 0.05)
    }
    const main = document.querySelector('main')
    const results = []
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    while (walker.nextNode()) {
      const node = walker.currentNode
      const text = node.textContent.trim()
      if (!text) continue
      const el = node.parentElement
      if (seen.has(el)) continue
      seen.add(el)
      const st = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      if (st.visibility === 'hidden' || st.display === 'none' || rect.width === 0 || rect.height === 0) continue
      if (el.closest('[aria-hidden="true"], .sr-only')) continue
      // Fonds composés de la racine vers l'élément.
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
      const bold = Number(st.fontWeight) >= 700
      const large = size >= 24 || (bold && size >= 18.66)
      results.push({ text: text.slice(0, 40), ratio: Math.round(ratio(fg, bg) * 100) / 100, min: large ? 3 : 4.5 })
    }
    return results
  })
}

async function capture(role, view) {
  const ctx = await browser.newContext({ viewport: view.viewport, locale: 'fr-FR', reducedMotion: 'reduce' })
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('uniflow-theme', t)
    } catch {
      // stockage indisponible
    }
  }, view.theme)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (/permission[_ ]denied/i.test(m.text())) denied.push({ role: role.key, view: view.suffix, text: m.text().slice(0, 300) })
  })
  await page.goto(`${BASE}/login`)
  await page.fill('#email', role.email)
  await page.fill('#password', role.password ?? passwordOf(role.email))
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}${role.path}`, { timeout: 30000 })
  await page.locator('main h1').first().waitFor({ timeout: 20000 })
  // Données chargées : plus aucun squelette ni indicateur de chargement.
  await page.waitForFunction(() => !document.querySelector('main .skeleton, main .loading, main [aria-busy="true"]'), null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
  // Pas de survol résiduel ; hauteur de fenêtre = contenu complet (la zone
  // <main> défile en interne, fullPage seul ne la déroulerait pas).
  await page.mouse.move(0, 0)
  const fullHeight = await page.evaluate(() => {
    const m = document.querySelector('main')
    return m.getBoundingClientRect().top + m.scrollHeight
  })
  if (fullHeight > view.viewport.height) {
    await page.setViewportSize({ width: view.viewport.width, height: Math.ceil(fullHeight) })
    await page.waitForTimeout(300)
  }
  const file = path.join(OUT, `${role.key}-${view.suffix}.png`)
  await page.screenshot({ path: file, fullPage: true })
  if (CONTRAST && !view.suffix.startsWith('mobile')) {
    const rows = await measureContrast(page)
    const failing = rows.filter((r) => r.ratio < r.min)
    const min = rows.reduce((m, r) => Math.min(m, r.ratio), Infinity)
    contrast[`${role.key}-${view.suffix}`] = { textes: rows.length, minimum: min, echecs: failing }
  }
  if (view.suffix.startsWith('mobile')) {
    const overflow = await page.evaluate(() => document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth + 1)
    if (overflow) denied.push({ role: role.key, view: view.suffix, text: 'débordement horizontal à 390 px' })
  }
  await ctx.close()
  console.log(`✔ ${role.key}-${view.suffix}.png`)
}

let browser
try {
  await app.auth().createUser({ uid: SA.uid, email: SA.email, password: SA.password, displayName: 'Super admin (captures)' })
  await app.auth().setCustomUserClaims(SA.uid, { role: 'super_admin_plateforme' })
  await app.database().ref(`users/${SA.uid}`).set({
    uid: SA.uid, email: SA.email, name: 'Khadija Sy', role: 'super_admin_plateforme', status: 'active', createdAt: Date.now(),
  })
  browser = await chromium.launch({ channel: process.env.AUDIT_BROWSER_CHANNEL ?? 'msedge', headless: true })
  for (const role of ROLES.filter((r) => !ONLY || ONLY.includes(r.key))) for (const view of VIEWS) await capture(role, view)
} finally {
  await browser?.close()
  await app.database().ref(`users/${SA.uid}`).remove().catch(() => {})
  await app.auth().deleteUser(SA.uid).catch(() => {})
  await app.delete()
}

writeFileSync(path.join(OUT, 'console.json'), JSON.stringify({ problemes: denied }, null, 1))
if (CONTRAST) writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(contrast, null, 1))
if (denied.length) {
  console.error(`✖ ${denied.length} problème(s) relevé(s) : voir console.json`)
  process.exitCode = 1
} else {
  console.log('✔ Aucune lecture refusée en console, aucun débordement à 390 px.')
}
