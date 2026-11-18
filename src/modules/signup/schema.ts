import { z } from 'zod'

/** Rôles qu'on peut demander soi-même : jamais un rôle administrateur. */
export const SIGNUP_ROLES = ['student', 'teacher'] as const
export type SignupRole = (typeof SIGNUP_ROLES)[number]

export const SIGNUP_ROLE_LABELS: Record<SignupRole, string> = {
  student: 'Étudiant',
  teacher: 'Enseignant',
}

export const signupFormSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Le prénom est requis').max(80, 'Prénom trop long'),
    lastName: z.string().trim().min(1, 'Le nom est requis').max(80, 'Nom trop long'),
    email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
    password: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
      .max(128, 'Mot de passe trop long'),
    confirmPassword: z.string(),
    universityId: z.string().min(1, 'Choisissez votre université'),
    requestedRole: z.enum(SIGNUP_ROLES, { message: 'Choisissez Étudiant ou Enseignant' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

export type SignupFormValues = z.infer<typeof signupFormSchema>
