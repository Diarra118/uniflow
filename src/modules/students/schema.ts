import { z } from 'zod'

export const studentFormSchema = z.object({
  studentNumber: z
    .string()
    .trim()
    .min(1, 'Le matricule est requis')
    .max(40, 'Le matricule est trop long'),
  firstName: z.string().trim().min(1, 'Le prénom est requis').max(80),
  lastName: z.string().trim().min(1, 'Le nom est requis').max(80),
  email: z.string().trim().min(1, "L'email est requis").email('Email invalide'),
  classId: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  enrollmentStatus: z.enum(['enrolled', 'pending', 'graduated', 'withdrawn']),
})

export type StudentFormValues = z.infer<typeof studentFormSchema>

export const ENROLLMENT_STATUS_LABELS: Record<StudentFormValues['enrollmentStatus'], string> = {
  enrolled: 'Inscrit',
  pending: 'En attente',
  graduated: 'Diplômé',
  withdrawn: 'Retiré',
}

export const ENROLLMENT_STATUS_BADGE: Record<StudentFormValues['enrollmentStatus'], string> = {
  enrolled: 'badge-success',
  pending: 'badge-warning',
  graduated: 'badge-info',
  withdrawn: 'badge-neutral',
}
