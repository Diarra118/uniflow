#!/usr/bin/env node
/**
 * npm run doctor — vérifie le poste avant la démo locale.
 *
 * Bloquant : Node 22 et Java 17+ (émulateurs Firebase).
 * Indicatif : dépendances installées, ports de la démo libres.
 * N'utilise que Node : fonctionne avant même `npm run setup`.
 */
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JAVA_INSTALL_HELP, MIN_JAVA, findJava } from './find-java.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NODE_URL = 'https://nodejs.org/fr/download (choisir la version 22 LTS)'
const PORTS = { 5173: 'application', 4000: 'interface des émulateurs', 4400: 'hub', 4500: 'journaux', 5001: 'Functions', 9000: 'Database', 9099: 'Auth' }

const ok = (msg) => console.log(`  \x1b[32m✔\x1b[0m ${msg}`)
const warn = (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`)
const bad = (msg) => console.log(`  \x1b[31m✖\x1b[0m ${msg}`)
let blocking = 0

console.log('\nUniFlow — vérification du poste\n')

// 1. Node 22
const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor === 22) ok(`Node ${process.versions.node}`)
else if (nodeMajor > 22) warn(`Node ${process.versions.node} : la démo vise Node 22 (version des Cloud Functions). Elle devrait fonctionner ; en cas de souci, installez Node 22 : ${NODE_URL}`)
else {
  bad(`Node ${process.versions.node} : Node 22 est requis. Installez-le : ${NODE_URL}`)
  blocking++
}

// 2. Java 17+
const java = findJava()
if (java && !java.tooOld) ok(`Java ${java.version}${java.home ? ` (${java.home})` : ''}`)
else {
  bad(`Java ${MIN_JAVA}+ ${java ? `requis (Java ${java.version} trouvé, trop ancien)` : 'introuvable'} : il fait tourner les émulateurs Firebase.\n    ${JAVA_INSTALL_HELP.replace(/\n/g, '\n  ')}`)
  blocking++
}

// 3. Dépendances (indicatif)
const firebaseBin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase')
const missing = ['node_modules', path.join('functions', 'node_modules')].filter((d) => !existsSync(path.join(ROOT, d)))
const installed = missing.length === 0 && existsSync(firebaseBin)
if (installed) ok('Dépendances installées (interface, Cloud Functions, émulateurs Firebase)')
else warn('Dépendances pas encore installées : lancez  npm run setup')

// 4. Ports (indicatif)
const isFree = (port) =>
  new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
const busy = []
for (const [port, what] of Object.entries(PORTS)) if (!(await isFree(Number(port)))) busy.push(`${port} (${what})`)
if (busy.length === 0) ok('Ports de la démo libres')
else warn(`Ports déjà utilisés : ${busy.join(', ')}. Une démo tourne peut-être déjà : arrêtez-la (Ctrl+C) avant  npm run demo`)

console.log(
  blocking
    ? `\n\x1b[31m${blocking} prérequis manquant(s) : installez-le(s), puis relancez  npm run doctor\x1b[0m\n`
    : `\n\x1b[32mPoste prêt.\x1b[0m Suite : ${installed ? '' : ' npm run setup  (une seule fois), puis '} npm run demo\n`
)
process.exitCode = blocking ? 1 : 0
