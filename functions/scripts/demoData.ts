/**
 * Jeu de données de démonstration UniFlow (données pures, sans accès réseau).
 *
 * Partagé par :
 * - seedDemo.ts : démo locale sur émulateurs (npm run demo) ;
 * - seedHosted.ts : version hébergée de démonstration (npm run seed:hosted).
 *
 * Ce module n'importe ni firebase-admin ni seedEmulators.ts : l'importer ne
 * configure aucun émulateur et ne vise aucun projet.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export type Role = 'admin_universite' | 'teacher' | 'student' | 'parent'

export interface Account {
  uid: string
  email: string
  name: string
  role: Role
  universityId: string
  linkedRecordId?: string
  linkedRecordType?: 'student' | 'teacher'
  /** Ce que le compte permet de montrer pendant la démo. */
  note: string
}

export interface Person {
  id: string
  number: string
  firstName: string
  lastName: string
  /** Pour un étudiant : classe (qui porte la filière). Pour un enseignant : département. */
  classId?: string
  department?: string
  enrollmentStatus?: 'enrolled' | 'pending' | 'graduated' | 'withdrawn'
  accountStatus?: 'active' | 'inactive'
  /** Accès de connexion créé (compte Auth + profil actif). */
  login?: boolean
}

export interface UniversityData {
  id: string
  domain: string
  meta: { name: string; slug: string; plan: 'standard' | 'premium' | 'enterprise' }
  admin: { uid: string; firstName: string; lastName: string }
  programs: { id: string; name: string; code: string; description: string; durationYears: number }[]
  classes: { id: string; name: string; programId: string; level: string }[]
  courses: { id: string; name: string; code: string; programId: string; teacherId?: string; credits: number }[]
  teachers: Person[]
  students: Person[]
  parent?: { uid: string; firstName: string; lastName: string; childId: string; relation: 'father' | 'mother' | 'guardian' }
}

export const YEAR = '2026-2027'

/** Établissements fictifs (adresses en .test, jamais routées). */
export const DEMO: UniversityData[] = [
  {
    id: 'universite-horizon',
    domain: 'horizon.test',
    meta: { name: 'Université Horizon', slug: 'universite-horizon', plan: 'premium' },
    admin: { uid: 'demo-admin-horizon', firstName: 'Fatou', lastName: 'Ndiaye' },
    programs: [
      { id: 'prog-inf', name: 'Licence Informatique', code: 'INF', description: 'Développement logiciel, systèmes et réseaux.', durationYears: 3 },
      { id: 'prog-ges', name: 'Licence Gestion des entreprises', code: 'GES', description: 'Comptabilité, finance et marketing.', durationYears: 3 },
      { id: 'prog-drt', name: 'Licence Droit privé', code: 'DRT', description: 'Droit civil, droit des affaires et procédure.', durationYears: 3 },
    ],
    classes: [
      { id: 'cls-inf-l1', name: 'L1 Informatique', programId: 'prog-inf', level: 'L1' },
      { id: 'cls-inf-l2', name: 'L2 Informatique', programId: 'prog-inf', level: 'L2' },
      { id: 'cls-ges-l1', name: 'L1 Gestion', programId: 'prog-ges', level: 'L1' },
      { id: 'cls-drt-l1', name: 'L1 Droit', programId: 'prog-drt', level: 'L1' },
    ],
    courses: [
      { id: 'crs-inf101', name: 'Algorithmique et programmation', code: 'INF101', programId: 'prog-inf', teacherId: 'ens-hz-1', credits: 6 },
      { id: 'crs-inf201', name: 'Bases de données', code: 'INF201', programId: 'prog-inf', teacherId: 'ens-hz-1', credits: 5 },
      { id: 'crs-inf202', name: 'Réseaux informatiques', code: 'INF202', programId: 'prog-inf', teacherId: 'ens-hz-4', credits: 4 },
      { id: 'crs-ges101', name: 'Comptabilité générale', code: 'GES101', programId: 'prog-ges', teacherId: 'ens-hz-2', credits: 6 },
      { id: 'crs-ges102', name: 'Introduction au marketing', code: 'GES102', programId: 'prog-ges', teacherId: 'ens-hz-2', credits: 4 },
      { id: 'crs-drt101', name: 'Droit des obligations', code: 'DRT101', programId: 'prog-drt', teacherId: 'ens-hz-3', credits: 6 },
      { id: 'crs-drt102', name: 'Introduction au droit', code: 'DRT102', programId: 'prog-drt', credits: 3 },
    ],
    teachers: [
      { id: 'ens-hz-1', number: 'HZ-ENS-001', firstName: 'Moussa', lastName: 'Traoré', department: 'Informatique', login: true },
      { id: 'ens-hz-2', number: 'HZ-ENS-002', firstName: 'Aminata', lastName: 'Sow', department: 'Gestion', login: true },
      { id: 'ens-hz-3', number: 'HZ-ENS-003', firstName: 'Ibrahima', lastName: 'Fall', department: 'Droit' },
      { id: 'ens-hz-4', number: 'HZ-ENS-004', firstName: 'Mariam', lastName: 'Coulibaly', department: 'Informatique', accountStatus: 'inactive' },
    ],
    students: [
      { id: 'etu-hz-01', number: 'HZ-2026-001', firstName: 'Awa', lastName: 'Diallo', classId: 'cls-inf-l1', login: true },
      { id: 'etu-hz-02', number: 'HZ-2026-002', firstName: 'Ousmane', lastName: 'Ba', classId: 'cls-inf-l1', login: true },
      { id: 'etu-hz-03', number: 'HZ-2026-003', firstName: 'Khady', lastName: 'Sarr', classId: 'cls-inf-l1' },
      { id: 'etu-hz-04', number: 'HZ-2025-014', firstName: 'Cheikh', lastName: 'Mbaye', classId: 'cls-inf-l2' },
      { id: 'etu-hz-05', number: 'HZ-2025-021', firstName: 'Ndeye', lastName: 'Gueye', classId: 'cls-inf-l2' },
      { id: 'etu-hz-06', number: 'HZ-2026-006', firstName: 'Abdoulaye', lastName: 'Cissé', classId: 'cls-ges-l1' },
      { id: 'etu-hz-07', number: 'HZ-2026-007', firstName: 'Rokhaya', lastName: 'Diop', classId: 'cls-ges-l1' },
      { id: 'etu-hz-08', number: 'HZ-2026-008', firstName: 'Mamadou', lastName: 'Kane', classId: 'cls-ges-l1', enrollmentStatus: 'pending' },
      { id: 'etu-hz-09', number: 'HZ-2026-009', firstName: 'Seynabou', lastName: 'Faye', classId: 'cls-drt-l1' },
      { id: 'etu-hz-10', number: 'HZ-2026-010', firstName: 'Pape', lastName: 'Thiam', classId: 'cls-drt-l1' },
      { id: 'etu-hz-11', number: 'HZ-2024-032', firstName: 'Astou', lastName: 'Niang', classId: 'cls-inf-l2', enrollmentStatus: 'withdrawn', accountStatus: 'inactive' },
      { id: 'etu-hz-12', number: 'HZ-2026-012', firstName: 'Lamine', lastName: 'Seck', classId: 'cls-drt-l1' },
    ],
    parent: { uid: 'demo-parent-horizon', firstName: 'Mamadou', lastName: 'Diallo', childId: 'etu-hz-01', relation: 'father' },
  },
  {
    id: 'institut-baobab',
    domain: 'baobab.test',
    meta: { name: 'Institut supérieur Baobab', slug: 'institut-baobab', plan: 'standard' },
    admin: { uid: 'demo-admin-baobab', firstName: 'Yacouba', lastName: 'Ouédraogo' },
    programs: [
      { id: 'prog-gcv', name: 'Génie civil', code: 'GCV', description: 'Construction, structures et travaux publics.', durationYears: 3 },
      { id: 'prog-agr', name: 'Agronomie', code: 'AGR', description: 'Production végétale et gestion des sols.', durationYears: 3 },
    ],
    classes: [
      { id: 'cls-gcv-1', name: 'Génie civil 1re année', programId: 'prog-gcv', level: 'L1' },
      { id: 'cls-gcv-2', name: 'Génie civil 2e année', programId: 'prog-gcv', level: 'L2' },
      { id: 'cls-agr-1', name: 'Agronomie 1re année', programId: 'prog-agr', level: 'L1' },
    ],
    courses: [
      { id: 'crs-gcv101', name: 'Résistance des matériaux', code: 'GCV101', programId: 'prog-gcv', teacherId: 'ens-bb-1', credits: 6 },
      { id: 'crs-gcv102', name: 'Topographie', code: 'GCV102', programId: 'prog-gcv', teacherId: 'ens-bb-1', credits: 4 },
      { id: 'crs-agr101', name: 'Pédologie', code: 'AGR101', programId: 'prog-agr', teacherId: 'ens-bb-2', credits: 5 },
      { id: 'crs-agr102', name: 'Production végétale', code: 'AGR102', programId: 'prog-agr', teacherId: 'ens-bb-3', credits: 5 },
    ],
    teachers: [
      { id: 'ens-bb-1', number: 'BB-ENS-001', firstName: 'Salif', lastName: 'Konaté', department: 'Génie civil', login: true },
      { id: 'ens-bb-2', number: 'BB-ENS-002', firstName: 'Aïcha', lastName: 'Zongo', department: 'Agronomie' },
      { id: 'ens-bb-3', number: 'BB-ENS-003', firstName: 'Boubacar', lastName: 'Sanogo', department: 'Agronomie' },
    ],
    students: [
      { id: 'etu-bb-01', number: 'BB-2026-001', firstName: 'Adama', lastName: 'Kaboré', classId: 'cls-gcv-1', login: true },
      { id: 'etu-bb-02', number: 'BB-2026-002', firstName: 'Fanta', lastName: 'Camara', classId: 'cls-gcv-1' },
      { id: 'etu-bb-03', number: 'BB-2026-003', firstName: 'Issa', lastName: 'Sawadogo', classId: 'cls-gcv-1' },
      { id: 'etu-bb-04', number: 'BB-2025-011', firstName: 'Kadiatou', lastName: 'Bah', classId: 'cls-gcv-2' },
      { id: 'etu-bb-05', number: 'BB-2025-017', firstName: 'Souleymane', lastName: 'Keita', classId: 'cls-gcv-2', enrollmentStatus: 'graduated' },
      { id: 'etu-bb-06', number: 'BB-2026-006', firstName: 'Mariama', lastName: 'Barry', classId: 'cls-agr-1' },
      { id: 'etu-bb-07', number: 'BB-2026-007', firstName: 'Tidiane', lastName: 'Dembélé', classId: 'cls-agr-1' },
      { id: 'etu-bb-08', number: 'BB-2026-008', firstName: 'Oumou', lastName: 'Sidibé', classId: 'cls-agr-1', enrollmentStatus: 'pending' },
    ],
  },
]

/** Racine du dépôt (dossier contenant database.rules.json). */
export function projectRoot(): string {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'database.rules.json'))) return dir
    if (path.dirname(dir) === dir) throw new Error('Racine du projet introuvable')
  }
}

export const ascii = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const emailOf = (firstName: string, lastName: string, domain: string) =>
  `${ascii(firstName)}.${ascii(lastName)}@${domain}`

/** Comptes de connexion du jeu de démo (sans mot de passe). */
export function demoAccounts(): Account[] {
  const accounts: Account[] = []
  for (const u of DEMO) {
    accounts.push({
      uid: u.admin.uid,
      email: `admin@${u.domain}`,
      name: `${u.admin.firstName} ${u.admin.lastName}`,
      role: 'admin_universite',
      universityId: u.id,
      note: 'Administration complète de son université : fiches, filières, cours, classes, création des accès.',
    })
    for (const t of u.teachers.filter((p) => p.login)) {
      const courses = u.courses.filter((c) => c.teacherId === t.id).map((c) => c.code)
      accounts.push({
        uid: `uid-${t.id}`,
        email: emailOf(t.firstName, t.lastName, u.domain),
        name: `${t.firstName} ${t.lastName}`,
        role: 'teacher',
        universityId: u.id,
        linkedRecordId: t.id,
        linkedRecordType: 'teacher',
        note: `Lecture des listes sans création ; responsable de ${courses.join(', ')}.`,
      })
    }
    for (const s of u.students.filter((p) => p.login)) {
      const cls = u.classes.find((c) => c.id === s.classId)
      accounts.push({
        uid: `uid-${s.id}`,
        email: emailOf(s.firstName, s.lastName, u.domain),
        name: `${s.firstName} ${s.lastName}`,
        role: 'student',
        universityId: u.id,
        linkedRecordId: s.id,
        linkedRecordType: 'student',
        note: `« Mon dossier » (${cls?.name ?? 'sans classe'}) ; listes des étudiants et enseignants refusées.`,
      })
    }
    if (u.parent) {
      const child = u.students.find((s) => s.id === u.parent?.childId)
      accounts.push({
        uid: u.parent.uid,
        email: emailOf(u.parent.firstName, u.parent.lastName, u.domain),
        name: `${u.parent.firstName} ${u.parent.lastName}`,
        role: 'parent',
        universityId: u.id,
        note: `Parent lié à ${child?.firstName} ${child?.lastName} (parentLinks) ; tableau de bord parent (enfants rattachés). Notes et paiements : modules non livrés.`,
      })
    }
  }
  return accounts
}

export function universityTree(u: UniversityData, now: number) {
  const day = 86_400_000
  const t0 = now - 60 * day
  const at = (i: number) => t0 + i * 3_600_000
  const programs: Record<string, unknown> = {}
  u.programs.forEach((p, i) => {
    const { id, ...rest } = p
    programs[id] = { ...rest, status: 'active', createdAt: at(i), updatedAt: at(i) }
  })
  const classes: Record<string, unknown> = {}
  u.classes.forEach((c, i) => {
    const { id, ...rest } = c
    classes[id] = { ...rest, academicYearLabel: YEAR, status: 'active', createdAt: at(10 + i), updatedAt: at(10 + i) }
  })
  const courses: Record<string, unknown> = {}
  u.courses.forEach((c, i) => {
    const { id, teacherId, ...rest } = c
    courses[id] = { ...rest, ...(teacherId ? { teacherId } : {}), createdAt: at(20 + i), updatedAt: at(20 + i) }
  })
  const teachers: Record<string, unknown> = {}
  u.teachers.forEach((t, i) => {
    teachers[t.id] = {
      employeeNumber: t.number,
      firstName: t.firstName,
      lastName: t.lastName,
      email: emailOf(t.firstName, t.lastName, u.domain),
      department: t.department ?? '',
      accountStatus: t.accountStatus ?? 'active',
      ...(t.login ? { uid: `uid-${t.id}` } : {}),
      searchKey: `${t.lastName} ${t.firstName} ${t.number}`.toLowerCase(),
      createdAt: at(30 + i),
      updatedAt: at(30 + i),
    }
  })
  const students: Record<string, unknown> = {}
  u.students.forEach((s, i) => {
    const cls = u.classes.find((c) => c.id === s.classId)
    students[s.id] = {
      studentNumber: s.number,
      firstName: s.firstName,
      lastName: s.lastName,
      email: emailOf(s.firstName, s.lastName, u.domain),
      classId: s.classId ?? '',
      programId: cls?.programId ?? '',
      enrollmentStatus: s.enrollmentStatus ?? 'enrolled',
      accountStatus: s.accountStatus ?? 'active',
      ...(s.login ? { uid: `uid-${s.id}` } : {}),
      searchKey: `${s.lastName} ${s.firstName} ${s.number}`.toLowerCase(),
      createdAt: at(50 + i),
      updatedAt: at(50 + i),
    }
  })
  const tree: Record<string, unknown> = {
    meta: { ...u.meta, status: 'active', ownerUid: u.admin.uid, createdAt: t0 },
    programs,
    classes,
    courses,
    teachers,
    students,
    usage: {
      studentAccounts: u.students.filter((s) => s.login).length,
      teacherAccounts: u.teachers.filter((t) => t.login).length,
    },
  }
  if (u.parent) {
    tree.parentLinks = {
      [u.parent.uid]: {
        // Clé = id de la fiche étudiant (convention recommandée, voir
        // README « Backlog sécurité » : sens de studentId à unifier).
        [u.parent.childId]: {
          studentId: u.parent.childId,
          relation: u.parent.relation,
          authorized: true,
          grantedAt: at(80),
          grantedBy: u.admin.uid,
        },
      },
    }
  }
  return tree
}
