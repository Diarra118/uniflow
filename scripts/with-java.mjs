#!/usr/bin/env node
/**
 * Lance une commande (ex. `firebase emulators:start`) avec un Java 17+
 * disponible, requis par les émulateurs Auth et Database.
 *
 * Recherche (scripts/find-java.mjs) : `java` du PATH, JAVA_HOME, puis les
 * emplacements usuels (JDK d'Android Studio, Temurin, Microsoft, Oracle,
 * /usr/lib/jvm, macOS). Sans Java : message clair et code de sortie 1.
 *
 * Usage : node scripts/with-java.mjs <commande> [arguments...]
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { JAVA_INSTALL_HELP, MIN_JAVA, findJava } from './find-java.mjs'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage : node scripts/with-java.mjs <commande> [arguments...]')
  process.exit(2)
}

const java = findJava()
if (!java || java.tooOld) {
  console.error(`
✖ Java ${MIN_JAVA}+ introuvable${java ? ` (Java ${java.version} trouvé, trop ancien)` : ''} : il est requis par les émulateurs Firebase (Auth, Database).

  ${JAVA_INSTALL_HELP}
`)
  process.exit(1)
}

const env = { ...process.env }
if (java.home) {
  env.JAVA_HOME = java.home
  env.PATH = `${path.join(java.home, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`
  console.log(`ℹ Java ${java.version} : ${java.home}`)
} else {
  console.log(`ℹ Java ${java.version} (PATH)`)
}

// Recompose la ligne de commande (arguments avec espaces entre guillemets)
// et passe par le shell pour résoudre `firebase` / `npm` (.cmd sous Windows).
const commandLine = args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')
const child = spawn(commandLine, { stdio: 'inherit', env, shell: true })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
// Ctrl+C est déjà reçu par la commande (même groupe de processus) : on
// attend simplement son arrêt propre (les émulateurs se ferment d'eux-mêmes).
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {})
