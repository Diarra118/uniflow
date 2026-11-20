/**
 * Données de la VERSION HÉBERGÉE de démonstration (projet Firebase
 * uniflow-demo-30e61, plan gratuit Spark, sans Cloud Functions).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<chemin de la clé, HORS du dépôt> npm run seed:hosted
 *
 * Sans Cloud Functions, ce script local fait, avec l'Admin SDK, ce que font
 * les fonctions en production :
 * - createUserAccount : compte Auth, profil users/{uid} actif, fiche liée
 *   (uid sur la fiche étudiant / enseignant, linkedRecordId sur le profil) ;
 * - onUserProfileWritten : custom claims { role, universityId } posés
 *   APRÈS le profil actif ;
 * - onUniversityMetaWritten : platform/universitiesIndex/{id}.
 * Jeu de données : celui de la démo locale (demoData.ts) — deux
 * universités, admins, enseignants, étudiants, filières, cours, classes et
 * un parent.
 *
 * Relançable : chaque exécution réécrit universities/{id} des deux
 * universités (les données de test ajoutées en ligne disparaissent), les
 * profils et l'index, et donne de NOUVEAUX mots de passe aléatoires aux
 * comptes de démo. Les mots de passe ne sont jamais affichés : ils sont
 * écrits uniquement dans docs/COMPTES-EN-LIGNE.local.md (non versionné).
 *
 * Garde-fous, tous vérifiés AVANT toute écriture :
 * - aucune variable d'émulateur (FIREBASE_*_EMULATOR_HOST) ;
 * - clé fournie par GOOGLE_APPLICATION_CREDENTIALS, hors du dépôt, de type
 *   service_account et du projet uniflow-demo-30e61 (sinon refus) ;
 * - GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT, s'ils sont définis, identiques ;
 * - URL de la base lue dans .env.hosted et propre à ce projet ;
 * - fichier des comptes ignoré par Git.
 * La clé n'est jamais copiée ni affichée : seul son chemin est transmis à
 * l'Admin SDK (identifiants par défaut de l'application).
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as admin from 'firebase-admin'
import { DEMO, demoAccounts, projectRoot, universityTree, type Role } from './demoData'

export const HOSTED_PROJECT_ID = 'uniflow-demo-30e61'
export const HOSTED_URL = `https://${HOSTED_PROJECT_ID}.web.app`

const ROOT = projectRoot()
const ACCOUNTS_REL = path.join('docs', 'COMPTES-EN-LIGNE.local.md')
const ACCOUNTS_FILE = path.join(ROOT, ACCOUNTS_REL)

class Refusal extends Error {}
const refuse = (msg: string): never => {
  throw new Refusal(`Refusé : ${msg}`)
}

/** Lecture minimale d'un fichier .env (clé=valeur). */
function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

function isInside(child: string, parent: string) {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Toutes les vérifications ; retourne l'URL de la base. Aucune écriture. */
function preflight(): { databaseURL: string } {
  for (const v of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB']) {
    if (process.env[v]) refuse(`${v} est défini : ce script vise le projet en ligne, pas les émulateurs.`)
  }

  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) {
    refuse('GOOGLE_APPLICATION_CREDENTIALS non défini (chemin de la clé du compte de service du projet de démo).')
  }
  const resolvedKey = path.resolve(keyPath as string)
  if (!existsSync(resolvedKey)) refuse('le fichier désigné par GOOGLE_APPLICATION_CREDENTIALS est introuvable.')
  if (isInside(resolvedKey, ROOT)) {
    refuse('la clé se trouve dans le dépôt. Déplacez-la hors du projet (elle ne doit jamais y être copiée).')
  }
  let key: { type?: unknown; project_id?: unknown }
  try {
    key = JSON.parse(readFileSync(resolvedKey, 'utf8'))
  } catch {
    return refuse('la clé n’est pas un fichier JSON lisible.')
  }
  if (key.type !== 'service_account') refuse('la clé n’est pas une clé de compte de service.')
  if (key.project_id !== HOSTED_PROJECT_ID) {
    refuse(`la clé n’appartient pas au projet de démo ${HOSTED_PROJECT_ID}. Aucun autre projet n’est accepté.`)
  }
  for (const v of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (process.env[v] && process.env[v] !== HOSTED_PROJECT_ID) refuse(`${v} vise un autre projet que ${HOSTED_PROJECT_ID}.`)
  }

  const envFile = path.join(ROOT, '.env.hosted')
  if (!existsSync(envFile)) refuse('.env.hosted absent (voir .env.hosted.example).')
  const env = readEnvFile(envFile)
  if (env.VITE_FIREBASE_PROJECT_ID !== HOSTED_PROJECT_ID) refuse(`.env.hosted ne vise pas ${HOSTED_PROJECT_ID}.`)
  const databaseURL = env.VITE_FIREBASE_DATABASE_URL ?? ''
  if (!databaseURL.startsWith(`https://${HOSTED_PROJECT_ID}-default-rtdb.`)) {
    refuse('VITE_FIREBASE_DATABASE_URL de .env.hosted n’est pas la base du projet de démo.')
  }

  // Le fichier des comptes contiendra des mots de passe réels : il doit être
  // ignoré par Git avant d'être écrit.
  const ignored = spawnSync('git', ['check-ignore', '-q', ACCOUNTS_REL], { cwd: ROOT })
  if (ignored.status !== 0) refuse(`${ACCOUNTS_REL} n’est pas ignoré par Git.`)

  return { databaseURL }
}

/** 24 caractères base64url (144 bits d'aléa). */
const strongPassword = () => randomBytes(18).toString('base64url')

function hostedApp(databaseURL: string): admin.app.App {
  return (
    admin.apps.find((a) => a?.name === 'hosted') ??
    admin.initializeApp(
      { credential: admin.credential.applicationDefault(), projectId: HOSTED_PROJECT_ID, databaseURL },
      'hosted'
    )
  )
}

async function upsertUser(auth: admin.auth.Auth, user: { uid: string; email: string; password: string; displayName: string }) {
  const props = { email: user.email, password: user.password, displayName: user.displayName, emailVerified: true, disabled: false }
  try {
    await auth.getUser(user.uid)
    await auth.updateUser(user.uid, props)
    return 'updated' as const
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err
    await auth.createUser({ uid: user.uid, ...props })
    return 'created' as const
  }
}

export async function seedHosted() {
  const { databaseURL } = preflight()
  const app = hostedApp(databaseURL)
  const db = app.database()
  const auth = app.auth()
  const now = Date.now()

  // 1. Universités (meta, filières, classes, cours, fiches liées par uid,
  //    liens parent-enfant) et index plateforme.
  for (const u of DEMO) {
    await db.ref(`universities/${u.id}`).set(universityTree(u, now))
    await db.ref(`platform/universitiesIndex/${u.id}`).set({ name: u.meta.name, plan: u.meta.plan, status: 'active' })
  }

  // 2. Comptes : Auth, puis profil actif, puis claims EN DERNIER (ordre de
  //    createUserAccount ; le déclencheur pose les mêmes claims en ligne).
  const passwords = new Map<string, string>()
  let created = 0
  for (const a of demoAccounts()) {
    const password = strongPassword()
    if ((await upsertUser(auth, { uid: a.uid, email: a.email, password, displayName: a.name })) === 'created') created++
    passwords.set(a.uid, password)
    await db.ref(`users/${a.uid}`).set({
      uid: a.uid,
      email: a.email,
      name: a.name,
      role: a.role,
      universityId: a.universityId,
      status: 'active',
      createdAt: now,
      ...(a.linkedRecordId ? { linkedRecordId: a.linkedRecordId, linkedRecordType: a.linkedRecordType } : {}),
    })
    await auth.setCustomUserClaims(a.uid, { role: a.role, universityId: a.universityId })
  }

  writeAccountsFile(passwords)
  await app.delete()
  return { accounts: passwords.size, created }
}

function writeAccountsFile(passwords: Map<string, string>) {
  const roleLabel: Record<Role, string> = {
    admin_universite: 'Admin université',
    teacher: 'Enseignant',
    student: 'Étudiant',
    parent: 'Parent',
  }
  const lines = [
    '# Comptes de la démo EN LIGNE UniFlow',
    '',
    '> Fichier **local, non versionné** (`*.local.md` dans `.gitignore`), écrit par',
    `> \`npm run seed:hosted\`. Ces comptes existent sur le projet de démonstration`,
    `> \`${HOSTED_PROJECT_ID}\` (données fictives). Ne les réutilisez nulle part ailleurs`,
    '> et ne publiez pas ce fichier.',
    '',
    `Application en ligne : ${HOSTED_URL}`,
    '',
    `Généré le ${new Date().toLocaleString('fr-FR')}. Chaque \`npm run seed:hosted\` remet les`,
    'données de démo à zéro et donne de nouveaux mots de passe (ce fichier est réécrit).',
    '',
    'Version en ligne sans Cloud Functions (plan gratuit Spark) : création de compte,',
    'création d\'accès, renvoi d\'invitation et demandes d\'inscription affichent',
    '« Disponible dans la version complète, à lancer en local : voir le README. »',
    '',
  ]
  for (const u of DEMO) {
    lines.push(`## ${u.meta.name} (\`${u.id}\`, offre ${u.meta.plan})`, '')
    lines.push('| Rôle | Nom | E-mail | Mot de passe | À montrer |', '|---|---|---|---|---|')
    for (const a of demoAccounts().filter((x) => x.universityId === u.id)) {
      lines.push(`| ${roleLabel[a.role]} | ${a.name} | \`${a.email}\` | \`${passwords.get(a.uid)}\` | ${a.note} |`)
    }
    lines.push('')
  }
  mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true })
  writeFileSync(ACCOUNTS_FILE, lines.join('\n'), 'utf8')
}

if (require.main === module) {
  seedHosted()
    .then(({ accounts, created }) => {
      console.log(
        `✔ Démo en ligne initialisée (${HOSTED_PROJECT_ID}) : ${DEMO.length} universités, ` +
          `${accounts} comptes (${created} créés, ${accounts - created} mis à jour), claims posés, index écrit.\n` +
          `  Comptes et mots de passe : ${ACCOUNTS_REL} (non versionné). Application : ${HOSTED_URL}`
      )
    })
    .catch((err: Error) => {
      console.error(`✖ ${err instanceof Refusal ? err.message : `Échec : ${err.message}`}`)
      process.exit(1)
    })
}
