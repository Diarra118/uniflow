import { ref, push, update, serverTimestamp } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, tenantDocPath } from '@/core/firebase/paths'
import type { CourseFormValues } from './schema'

/**
 * Realtime Database rejette les valeurs `undefined` en écriture. `null`
 * est en revanche la façon standard d'effacer un champ optionnel
 * précédemment renseigné (ex : retirer l'enseignant assigné à un cours).
 */
function normalize(values: CourseFormValues) {
  return {
    name: values.name,
    code: values.code,
    programId: values.programId,
    teacherId: values.teacherId || null,
    credits: values.credits ?? null,
  }
}

export async function createCourse(universityId: string, values: CourseFormValues) {
  const listRef = ref(rtdb, tenantCollectionPath(universityId, 'courses'))
  const newRef = push(listRef)
  await update(newRef, {
    ...normalize(values),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
  return newRef.key as string
}

export async function updateCourse(
  universityId: string,
  courseId: string,
  values: CourseFormValues
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'courses', courseId))
  await update(nodeRef, {
    ...normalize(values),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}
