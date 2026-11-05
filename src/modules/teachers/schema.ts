import { z } from 'zod'

export const teacherFormSchema = z.object({
  employeeNumber: z
    .string()
    .trim()
    .min(1, "Le matricule employé est requis")
    .max(40, 'Le matricule est trop long'),
  firstName: z.string().trim().min(1, 'Le prénom est requis').max(80),
  lastName: z.string().trim().min(1, 'Le nom est requis').max(80),
  email: z.string().trim().min(1, "L'email est requis").email('Email invalide'),
  department: z.string().trim().optional(),
})

export type TeacherFormValues = z.infer<typeof teacherFormSchema>
