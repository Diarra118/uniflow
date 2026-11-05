import type { Role } from '@/core/types'

export const ROLE_LABELS: Record<Role, string> = {
  super_admin_plateforme: 'Administrateur plateforme',
  admin_universite: "Administrateur d'université",
  teacher: 'Enseignant',
  student: 'Étudiant',
  parent: 'Parent',
}
