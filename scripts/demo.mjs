#!/usr/bin/env node
/**
 * Démo locale en une commande (émulateurs uniquement, aucun service réel).
 *
 *   npm run demo         démarre tout ; Ctrl+C arrête et sauvegarde
 *   npm run demo:reset   efface les données sauvegardées puis démarre
 *
 * Étapes : compilation des fonctions → émulateurs Auth, Database, Functions
 * (projet fictif demo-uniflow) avec --import/--export-on-exit sur .demo-data
 * → règles chargées et jeu de démo importé (functions/scripts/seedDemo.ts)
 * → front Vite en mode émulateurs sur http://localhost:5173.
 *
 * Ctrl+C : les émulateurs exportent leurs données dans .demo-data (fichier
 * non versionné) avant de s'arrêter ; le lancement suivant les réimporte.
 * Aucun mot de passe n'est affiché : ils sont dans docs/COMPTES-DEMO.local.md.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_ID = 'demo-uniflow'
const DATA_DIR = '.demo-data'
const APP_PORT = 5173
const READY_TIMEOUT_MS = 180_000
const isWin = process.platform === 'win32'

const log = (msg) => console.log(`\x1b[36m[démo]\x1b[0m ${msg}`)
const fail = (msg) => {
  console.error(`\x1b[31m[démo] ✖ ${msg}\x1b[0m`)
  process.exitCode = 1
}

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return
  if (isWin) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

function run(command, env = {}) {
  const r = spawnSync(command, { cwd: ROOT, shell: true, stdio: 'inherit', env: { ...process.env, ...env } })
  return r.status === 0
}

// 0. Prérequis
const firebaseBin = path.join('node_modules', '.bin', isWin ? 'firebase.cmd' : 'firebase')
for (const dir of ['node_modules', 'functions/node_modules', firebaseBin]) {
  if (!existsSync(path.join(ROOT, dir))) {
    fail(`Dépendances absentes (${dir}). Lancez d'abord : npm run setup  (vérification du poste : npm run doctor)`)
    process.exit(1)
  }
}
if (process.argv.includes('--reset')) {
  rmSync(path.join(ROOT, DATA_DIR), { recursive: true, force: true })
  rmSync(path.join(ROOT, 'docs', 'COMPTES-DEMO.local.md'), { force: true })
  log('Données sauvegardées effacées : un nouveau jeu de démo sera créé.')
}
log(existsSync(path.join(ROOT, DATA_DIR))
  ? `Données de la démo précédente trouvées (${DATA_DIR}) : elles seront réimportées.`
  : 'Premier lancement : le jeu de démo sera créé.')

// 1. Compilation des fonctions (lib/ pour l'émulateur, lib-test/ pour le seed)
log('Compilation des Cloud Functions…')
if (!run('npm --prefix functions run build') || !run('npm --prefix functions run build:test')) {
  fail('Compilation des fonctions impossible.')
  process.exit(1)
}

// 2. Émulateurs (Java requis : scripts/with-java.mjs le trouve)
log('Démarrage des émulateurs (Auth, Database, Functions)…')
const emulators = spawn(
  `node scripts/with-java.mjs firebase emulators:start --project ${PROJECT_ID} --import ${DATA_DIR} --export-on-exit ${DATA_DIR}`,
  { cwd: ROOT, shell: true, stdio: ['inherit', 'pipe', 'inherit'] }
)
let vite = null
let stopping = false

const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('les émulateurs ne démarrent pas (délai dépassé)')), READY_TIMEOUT_MS)
  emulators.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    if (String(chunk).includes('All emulators ready')) {
      clearTimeout(timer)
      resolve()
    }
  })
  emulators.on('exit', () => {
    clearTimeout(timer)
    reject(new Error('les émulateurs se sont arrêtés au démarrage (port occupé ? voir ci-dessus)'))
  })
})

emulators.on('exit', (code) => {
  killTree(vite)
  if (stopping) log(`Émulateurs arrêtés ; données sauvegardées dans ${DATA_DIR}.`)
  process.exit(code ?? 0)
})

// Ctrl+C est reçu directement par les émulateurs (même console) : ils
// exportent puis s'arrêtent, ce qui termine ce script (ci-dessus).
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    if (!stopping) log('Arrêt demandé : sauvegarde des données des émulateurs…')
    stopping = true
    killTree(vite)
  })
}

try {
  await ready
} catch (err) {
  fail(err.message)
  killTree(emulators)
  process.exit(1)
}

// 3. Règles + jeu de démo
log('Chargement des règles et des données de démo…')
if (!run('node functions/lib-test/scripts/seedDemo.js', { GCLOUD_PROJECT: PROJECT_ID })) {
  fail('Import des données de démo impossible : arrêt des émulateurs.')
  killTree(emulators)
  process.exit(1)
}

// 4. Front
vite = spawn(`npx vite --port ${APP_PORT} --strictPort`, {
  cwd: ROOT,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, VITE_USE_EMULATORS: 'true' },
})
vite.on('exit', (code) => {
  if (stopping) return
  if (code !== 0) fail(`Le front s'est arrêté (code ${code}) : port ${APP_PORT} déjà utilisé ?`)
  log('Front arrêté. Ctrl+C pour arrêter les émulateurs et sauvegarder les données.')
})

log(`
  ┌────────────────────────────────────────────────────────────────┐
  │  Démo UniFlow prête (émulateurs, aucune donnée réelle)         │
  │  Application   : http://localhost:${APP_PORT}                        │
  │  Émulateurs    : http://127.0.0.1:4000                         │
  │  Comptes       : docs/COMPTES-DEMO.local.md                    │
  │  Arrêt         : Ctrl+C (données sauvegardées dans ${DATA_DIR})  │
  └────────────────────────────────────────────────────────────────┘`)
