/**
 * Recherche d'un Java 17+ (requis par les émulateurs Firebase Auth et
 * Database). Partagé par scripts/with-java.mjs et scripts/doctor.mjs.
 *
 * Ordre : `java` du PATH, JAVA_HOME, puis les emplacements usuels (JDK
 * d'Android Studio, Temurin, Microsoft, Oracle, /usr/lib/jvm, macOS).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const MIN_JAVA = 17
const exe = process.platform === 'win32' ? 'java.exe' : 'java'

/** Version majeure de Java (8, 17, 21…), ou null si introuvable. */
export function javaVersion(javaBin) {
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
    homes.push('/opt/homebrew/opt/openjdk@21', '/opt/homebrew/opt/openjdk', '/usr/local/opt/openjdk@21')
  } else {
    homes.push(...childDirs('/usr/lib/jvm'))
    homes.push('/opt/android-studio/jbr')
  }
  return homes
}

/**
 * Premier Java ≥ 17 trouvé : { home, version } (home = null s'il vient du
 * PATH). À défaut, un Java trop ancien : { version, tooOld: true }.
 * Aucun Java : null.
 */
export function findJava() {
  let tooOld = null
  const onPath = javaVersion('java')
  if (onPath !== null && onPath >= MIN_JAVA) return { home: null, version: onPath }
  if (onPath !== null) tooOld = onPath
  for (const home of candidateHomes()) {
    const bin = path.join(home, 'bin', exe)
    if (!existsSync(bin)) continue
    const version = javaVersion(bin)
    if (version !== null && version >= MIN_JAVA) return { home, version }
    if (version !== null) tooOld ??= version
  }
  return tooOld === null ? null : { home: null, version: tooOld, tooOld: true }
}

export const JAVA_INSTALL_HELP = `Installez Java 21 (gratuit), puis relancez la commande :
    Windows : winget install EclipseAdoptium.Temurin.21.JDK
    macOS   : brew install openjdk@21
    Linux   : sudo apt install openjdk-21-jre-headless
    Ou téléchargez-le : https://adoptium.net/temurin/releases/?version=21
  Un JDK déjà présent ailleurs : définissez JAVA_HOME=<dossier du JDK>.`
