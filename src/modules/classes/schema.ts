import { z } from 'zod'

export const classFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(120),
  programId: z.string().trim().min(1, 'La filière est requise'),
  level: z.string().trim().max(40).optional(),
  academicYearLabel: z.string().trim().max(40).optional(),
})

export type ClassFormValues = z.infer<typeof classFormSchema>
