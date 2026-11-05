import { z } from 'zod'

export const courseFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(120),
  code: z.string().trim().min(1, 'Le code est requis').max(20),
  programId: z.string().trim().min(1, 'La filière est requise'),
  teacherId: z.string().trim().optional(),
  credits: z.coerce.number().int().min(0).max(60).optional(),
})

export type CourseFormValues = z.infer<typeof courseFormSchema>
