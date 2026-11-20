/**
 * Jeu de données de la DÉMO LOCALE (émulateurs uniquement), lancé par
 * `npm run demo` après le démarrage des émulateurs.
 *
 * - Charge toujours database.rules.json sur le namespace partagé (les règles
 *   ne font pas partie des données exportées par --export-on-exit).
 * - Données de démo déjà présentes (import de .demo-data) et fichier des
 *   comptes présent : rien d'autre, les données sont conservées.
 * - Données présentes mais fichier des comptes absent : nouveaux mots de
 *   passe pour les comptes de démo, fichier réécrit.
 * - Sinon : remise à zéro des émulateurs puis création du jeu complet, et
 *   écriture de docs/COMPTES-DEMO.local.md (non versionné).
 *
 * Aucun mot de passe n'est affiché dans le terminal. Mêmes garde-fous que le
 * seed des tests (seedEmulators.ts) : projet « demo-* » obligatoire et hôtes
 * d'émulateurs forcés avant l'initialisation de l'Admin SDK.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AUTH_EMULATOR, PROJECT_ID, loadRulesIntoEmulator, seedApp } from './seedEmulators'
import { DEMO, demoAccounts, projectRoot, universityTree, type Role } from './demoData'

/** Jeu de démo : défini dans demoData.ts, réexporté pour les tests. */
export { DEMO, demoAccounts }

export const ACCOUNTS_FILE = path.join(projectRoot(), 'docs', 'COMPTES-DEMO.local.md')

/** Marqueur du jeu de démo dans la base. */
const MARKER = `universities/${DEMO[0].id}/meta`

const newPassword = () => randomBytes(9).toString('base64url')

async function resetEmulators() {
  const res = await fetch(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Réinitialisation de l'émulateur Auth impossible (HTTP ${res.status}).`)
  await seedApp().database().ref().set(null)
}

async function createAll(now: number): Promise<Map<string, string>> {
  const app = seedApp()
  const db = app.database()
  const auth = app.auth()
  for (const u of DEMO) await db.ref(`universities/${u.id}`).set(universityTree(u, now))
  const passwords = new Map<string, string>()
  for (const a of demoAccounts()) {
    const password = newPassword()
    passwords.set(a.uid, password)
    await auth.createUser({ uid: a.uid, email: a.email, password, displayName: a.name, emailVerified: true })
    // Claims posés directement (le déclencheur, actif sous l'émulateur, pose
    // les mêmes à l'écriture du profil).
    await auth.setCustomUserClaims(a.uid, { role: a.role, universityId: a.universityId })
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
  }
  return passwords
}

async function regeneratePasswords(): Promise<Map<string, string>> {
  const auth = seedApp().auth()
  const passwords = new Map<string, string>()
  for (const a of demoAccounts()) {
    const password = newPassword()
    try {
      await auth.updateUser(a.uid, { password })
      passwords.set(a.uid, password)
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err
    }
  }
  return passwords
}

function writeAccountsFile(passwords: Map<string, string>) {
  const roleLabel: Record<Role, string> = {
    admin_universite: 'Admin université',
    teacher: 'Enseignant',
    student: 'Étudiant',
    parent: 'Parent',
  }
  const lines = [
    '# Comptes de la démo locale UniFlow',
    '',
    '> Fichier **local, non versionné** (`*.local.md` dans `.gitignore`), écrit par',
    '> `npm run demo`. Ces mots de passe n\'existent que dans les **émulateurs**',
    '> Firebase de votre poste (projet fictif `demo-uniflow`) : ils ne donnent',
    '> accès à aucun service réel. Ne les réutilisez nulle part ailleurs.',
    '',
    'Application : http://localhost:5173 — interface des émulateurs : http://127.0.0.1:4000',
    '',
    `Généré le ${new Date().toLocaleString('fr-FR')}. Nouveaux mots de passe : supprimez ce`,
    'fichier puis relancez `npm run demo` (données conservées), ou `npm run demo:reset`',
    '(jeu de données recréé).',
    '',
  ]
  for (const u of DEMO) {
    lines.push(`## ${u.meta.name} (\`${u.id}\`, offre ${u.meta.plan})`, '')
    lines.push('| Rôle | Nom | E-mail | Mot de passe | À montrer |', '|---|---|---|---|---|')
    for (const a of demoAccounts().filter((x) => x.universityId === u.id)) {
      const pwd = passwords.get(a.uid)
      lines.push(`| ${roleLabel[a.role]} | ${a.name} | \`${a.email}\` | ${pwd ? `\`${pwd}\`` : '(compte supprimé)'} | ${a.note} |`)
    }
    lines.push(
      '',
      `Données : ${u.programs.length} filières, ${u.classes.length} classes, ${u.courses.length} cours, ` +
        `${u.teachers.length} enseignants, ${u.students.length} étudiants` +
        (u.parent ? ', 1 lien parent-enfant.' : '.'),
      ''
    )
  }
  lines.push(
    '## Parcours suggéré',
    '',
    '1. Admin Horizon : listes, fiches, création d\'un accès depuis une fiche sans compte',
    '   (le lien d\'invitation s\'affiche dans le terminal des émulateurs).',
    '2. Admin Baobab : aucune donnée d\'Horizon visible (isolation des universités).',
    '3. Enseignant : listes en lecture seule, aucun bouton de création.',
    '4. Étudiant : « Mon dossier » uniquement.',
    '5. Révocation : dans l\'interface des émulateurs (Realtime Database), passer',
    '   `users/<uid>/status` à `suspended` pendant qu\'un compte est connecté :',
    '   déconnexion immédiate avec message. Remettre `active` pour rétablir.',
    '6. Auto-inscription : « Créer un compte » sur la page de connexion, puis',
    '   lien « Inscriptions » côté admin pour valider ou refuser la demande.',
    ''
  )
  mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true })
  writeFileSync(ACCOUNTS_FILE, lines.join('\n'), 'utf8')
}

export type DemoSeedOutcome = 'created' | 'kept' | 'passwords-regenerated'

/**
 * Index plateforme (miroir de meta, tenu en production par
 * onUniversityMetaWritten) : source de la liste publique de l'inscription.
 * Réécrit à chaque lancement, y compris sur des données importées d'une
 * version antérieure qui n'avait pas cet index.
 */
async function writeUniversityIndex() {
  const db = seedApp().database()
  for (const u of DEMO) {
    const meta = (await db.ref(`universities/${u.id}/meta`).get()).val() as
      | { name?: string; plan?: string; status?: string }
      | null
    if (!meta) continue
    await db.ref(`platform/universitiesIndex/${u.id}`).set({
      name: meta.name ?? u.meta.name,
      plan: meta.plan ?? u.meta.plan,
      status: meta.status ?? 'active',
    })
  }
}

export async function seedDemo(): Promise<DemoSeedOutcome> {
  await loadRulesIntoEmulator()
  const db = seedApp().database()
  const present = (await db.ref(MARKER).get()).exists()
  let outcome: DemoSeedOutcome
  if (present && existsSync(ACCOUNTS_FILE)) {
    outcome = 'kept'
  } else if (present) {
    writeAccountsFile(await regeneratePasswords())
    outcome = 'passwords-regenerated'
  } else {
    await resetEmulators()
    writeAccountsFile(await createAll(Date.now()))
    outcome = 'created'
  }
  await writeUniversityIndex()
  return outcome
}

if (require.main === module) {
  seedDemo()
    .then(async (outcome) => {
      const rel = path.relative(projectRoot(), ACCOUNTS_FILE)
      const msg: Record<DemoSeedOutcome, string> = {
        created: `Jeu de démo créé (${DEMO.length} universités).`,
        kept: 'Données de la démo précédente conservées (import).',
        'passwords-regenerated': 'Données conservées ; nouveaux mots de passe des comptes de démo.',
      }
      console.log(`✔ ${msg[outcome]} Règles chargées. Comptes et mots de passe : ${rel}`)
      await seedApp().delete()
    })
    .catch((err: Error) => {
      console.error(`✖ ${err.message}`)
      process.exit(1)
    })
}
