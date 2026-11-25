import { z } from 'zod'
import type { ExamType } from '@/core/types'

export const EXAM_TYPES: ExamType[] = ['homework', 'midterm', 'final']

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  homework: 'Devoir',
  midterm: 'Partiel',
  final: 'Examen final',
}

/** Bornes identiques à celles de database.rules.json (exams/.validate). */
export const examFormSchema = z.object({
  title: z.string().trim().min(1, 'Le titre est requis').max(120, '120 caractères au plus'),
  type: z.enum(['homework', 'midterm', 'final'], { message: 'Choisissez un type' }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date requise'),
  coefficient: z.coerce
    .number({ message: 'Coefficient requis' })
    .gt(0, 'Le coefficient doit être positif')
    .max(10, '10 au plus'),
  maxScore: z.coerce
    .number({ message: 'Note maximale requise' })
    .gt(0, 'La note maximale doit être positive')
    .max(100, '100 au plus'),
})

export type ExamFormValues = z.infer<typeof examFormSchema>

export const COMMENT_MAX = 500

/**
 * Lecture d'une note saisie (virgule ou point décimal). Chaîne vide : pas
 * de note. Mêmes bornes que les règles : 0 à la note maximale de l'examen.
 */
export function parseScore(raw: string, maxScore: number): { value: number | null; error?: string } {
  const text = raw.trim().replace(',', '.')
  if (text === '') return { value: null }
  if (!/^\d+(\.\d+)?$/.test(text)) return { value: null, error: 'Nombre attendu' }
  const value = Number(text)
  if (value > maxScore) return { value: null, error: `${formatScore(maxScore)} au plus` }
  return { value }
}

const scoreFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** 12,5 — notes et moyennes affichées en français. */
export const formatScore = (n: number) => scoreFormat.format(n)

const examDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** « 12 nov. 2026 » à partir d'une date AAAA-MM-JJ. */
export function formatExamDate(date: string) {
  const ms = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(ms) ? date : examDate.format(ms)
}

/** Date du jour au format AAAA-MM-JJ (fuseau local), valeur par défaut d'un nouvel examen. */
export function todayIso(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}
