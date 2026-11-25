import { ref, push, set, update, remove } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, tenantDocPath } from '@/core/firebase/paths'
import type { Exam, Grade } from '@/core/types'
import type { ExamFormValues } from './schema'
import { gradeId } from './grading'

/** Nouvel examen d'un cours. Auteur obligatoire (createdBy / updatedBy =
 * auth.uid, vérifiés par les règles). */
export async function createExam(universityId: string, courseId: string, values: ExamFormValues, authorUid: string) {
  const newRef = push(ref(rtdb, tenantCollectionPath(universityId, 'exams')))
  const now = Date.now()
  await set(newRef, {
    courseId,
    title: values.title.trim(),
    type: values.type,
    date: values.date,
    coefficient: values.coefficient,
    maxScore: values.maxScore,
    createdBy: authorUid,
    updatedBy: authorUid,
    createdAt: now,
    updatedAt: now,
  } satisfies Omit<Exam, 'id'>)
  return newRef.key as string
}

export interface GradeEntry {
  studentId: string
  value: number
  comment: string
}

/**
 * Enregistre les notes d'un examen en une seule écriture atomique
 * (multi-chemins) : soit toutes passent les règles, soit aucune. Les notes
 * déjà saisies gardent leur auteur et leur date de création.
 */
export async function saveExamGrades(
  universityId: string,
  exam: Pick<Exam, 'id' | 'courseId'>,
  entries: GradeEntry[],
  existing: Map<string, Grade>,
  authorUid: string
) {
  if (entries.length === 0) return
  const now = Date.now()
  const changes: Record<string, unknown> = {}
  for (const e of entries) {
    const prev = existing.get(e.studentId)
    const comment = e.comment.trim()
    changes[gradeId(exam.id, e.studentId)] = {
      examId: exam.id,
      courseId: exam.courseId,
      studentId: e.studentId,
      value: e.value,
      ...(comment ? { comment } : {}),
      createdBy: prev?.createdBy ?? authorUid,
      updatedBy: authorUid,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }
  }
  await update(ref(rtdb, tenantCollectionPath(universityId, 'grades')), changes)
}

/** Correction d'une note par l'admin : valeur et appréciation seulement. */
export async function correctGrade(universityId: string, grade: Grade, value: number, comment: string, authorUid: string) {
  const text = comment.trim()
  await update(ref(rtdb, tenantDocPath(universityId, 'grades', grade.id)), {
    value,
    comment: text ? text : null,
    updatedBy: authorUid,
    updatedAt: Date.now(),
  })
}

/** Suppression d'une note (admin seulement, après confirmation). */
export async function deleteGrade(universityId: string, id: string) {
  await remove(ref(rtdb, tenantDocPath(universityId, 'grades', id)))
}
