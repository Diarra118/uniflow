#!/usr/bin/env node
/**
 * Lance une commande (ex. `firebase emulators:start`) avec un Java 17+
 * disponible, requis par les émulateurs Auth et Database.
 *
 * Recherche, dans l'ordre : `java` du PATH, JAVA_HOME, puis les
 * emplacements usuels (JDK d'Android Studio, Temurin, Microsoft, Oracle,
 * /usr/lib/jvm, macOS). Sans Java : message clair et code de sortie 1.
 *
 * Usage : node scripts/with-java.mjs <commande> [arguments...]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const MIN_JAVA = 17
const exe = process.platform === 'win32' ? 'java.exe' : 'java'

function javaVersion(javaBin) {
  const r = spawnSync(javaBin, ['-version'], { encoding: 'utf8' })
  if (r.error || r.status !== 0) return null
  const m = `${r.stderr}${r.stdout}`.match(/version "(\d+)(?:\.(\d+))?/)
  if (!m) return null
  // Java 8 s'affiche « 1.8 ».
  return m[1] === '1' ? Number(m[2]) : Number(m[1])
}

function childDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name))
  } catch {
    return []
  }
}

function candidateHomes() {
  const homes = []
  if (process.env.JAVA_HOME) homes.push(process.env.JAVA_HOME)
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
    homes.push(path.join(pf, 'Android', 'Android Studio', 'jbr'))
    for (const vendor of ['Eclipse Adoptium', 'Microsoft', 'Java', 'Zulu', 'Amazon Corretto']) {
      homes.push(...childDirs(path.join(pf, vendor)))
    }
  } else if (process.platform === 'darwin') {
    homes.push('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
    homes.push(...childDirs('/Library/Java/JavaVirtualMachines').map((d) => path.join(d, 'Contents', 'Home')))
  } else {
    homes.push(...childDirs('/usr/lib/jvm'))
    homes.push('/opt/android-studio/jbr')
  }
  return homes
}

function findJava() {
  const onPath = javaVersion('java')
  if (onPath !== null && onPath >= MIN_JAVA) return { home: null, version: onPath }
  for (const home of candidateHomes()) {
    const bin = path.join(home, 'bin', exe)
    if (!existsSync(bin)) continue
    const version = javaVersion(bin)
    if (version !== null && version >= MIN_JAVA) return { home, version }
  }
  return null
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage : node scripts/with-java.mjs <commande> [arguments...]')
  process.exit(2)
}

const java = findJava()
if (!java) {
  console.error(`
✖ Java ${MIN_JAVA}+ introuvable : il est requis par les émulateurs Firebase (Auth, Database).

  Installez-le, puis relancez la commande :
    Windows : winget install EclipseAdoptium.Temurin.21.JDK
    macOS   : brew install openjdk@21
    Linux   : sudo apt install openjdk-21-jre-headless

  Ou indiquez un JDK existant : JAVA_HOME=<dossier du JDK>
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
