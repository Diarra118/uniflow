import { z } from 'zod'

export const programFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis').max(120),
  code: z.string().trim().min(1, 'Le code est requis').max(20),
  description: z.string().trim().max(500).optional(),
  durationYears: z.coerce.number().int().min(1, 'Minimum 1 an').max(10, 'Maximum 10 ans'),
})

export type ProgramFormValues = z.infer<typeof programFormSchema>
