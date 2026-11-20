#!/usr/bin/env node
/**
 * Build de la version hébergée de démonstration : npm run build:hosted
 *
 * Construit dist/ en mode Vite « hosted », donc avec .env.hosted (non
 * versionné, modèle : .env.hosted.example). Appelé aussi par le predeploy de
 * la section hosting de firebase.json : un déploiement Hosting ne peut pas
 * envoyer un dist/ construit avec la configuration locale habituelle.
 *
 * Garde-fous, vérifiés avant et après le build :
 * - .env.hosted vise le projet de démo, avec VITE_FUNCTIONS_ENABLED=false ;
 * - Vite chargeant aussi .env et .env.local, chacune de leurs clés VITE_*
 *   doit être redéfinie dans .env.hosted (aucune valeur locale ne passe) ;
 * - aucune variable VITE_* dans l'environnement du terminal (prioritaire) ;
 * - après le build, le bundle contient l'identifiant du projet de démo et
 *   pas celui de .env.local.
 * Aucune valeur n'est affichée.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_PROJECT = 'uniflow-demo-30e61'
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]

function fail(msg) {
  console.error(`\x1b[31m[build:hosted] ✖ ${msg}\x1b[0m`)
  process.exit(1)
}
const log = (msg) => console.log(`\x1b[36m[build:hosted]\x1b[0m ${msg}`)

/** Lecture minimale d'un fichier .env (clé=valeur, commentaires #). */
function readEnv(file) {
  const full = path.join(ROOT, file)
  if (!existsSync(full)) return null
  const out = {}
  for (const raw of readFileSync(full, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const hosted = readEnv('.env.hosted')
if (!hosted) fail('.env.hosted absent : copiez .env.hosted.example et remplissez-le (voir docs/RECETTE.md).')
if (existsSync(path.join(ROOT, '.env.hosted.local'))) {
  fail('.env.hosted.local présent : il surchargerait .env.hosted. Supprimez-le.')
}
for (const key of REQUIRED) if (!hosted[key]) fail(`${key} vide dans .env.hosted.`)
if (hosted.VITE_FIREBASE_PROJECT_ID !== DEMO_PROJECT) {
  fail(`.env.hosted doit viser le projet de démo ${DEMO_PROJECT}.`)
}
if (!hosted.VITE_FIREBASE_DATABASE_URL.includes(DEMO_PROJECT)) {
  fail('VITE_FIREBASE_DATABASE_URL ne correspond pas au projet de démo.')
}
if (hosted.VITE_FUNCTIONS_ENABLED !== 'false') fail('VITE_FUNCTIONS_ENABLED=false attendu dans .env.hosted.')
if (hosted.VITE_USE_EMULATORS === 'true') fail('VITE_USE_EMULATORS=true interdit dans .env.hosted.')

for (const file of ['.env', '.env.local']) {
  const other = readEnv(file)
  if (!other) continue
  const leaking = Object.keys(other).filter((k) => k.startsWith('VITE_') && !(k in hosted))
  if (leaking.length) fail(`${leaking.length} clé(s) de ${file} absente(s) de .env.hosted : ${leaking.join(', ')}.`)
}
const fromShell = Object.keys(process.env).filter((k) => k.startsWith('VITE_'))
if (fromShell.length) fail(`Variables VITE_* définies dans le terminal (prioritaires) : ${fromShell.join(', ')}.`)

function run(cmd) {
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, stdio: 'inherit' })
  if (r.status !== 0) fail(`échec de : ${cmd}`)
}

log(`Build de la version hébergée (projet ${DEMO_PROJECT}, sans Cloud Functions)…`)
run('npx tsc -b')
run('npx vite build --mode hosted')

const assets = path.join(ROOT, 'dist', 'assets')
const bundle = readdirSync(assets)
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(path.join(assets, f), 'utf8'))
  .join('\n')
if (!bundle.includes(DEMO_PROJECT)) fail('le bundle ne contient pas la configuration du projet de démo.')
const localProject = readEnv('.env.local')?.VITE_FIREBASE_PROJECT_ID
if (localProject && localProject !== DEMO_PROJECT && bundle.includes(localProject)) {
  fail('le bundle contient l’identifiant du projet de .env.local : build rejeté.')
}
log('✔ dist/ prêt pour le projet de démo.')
