import { ref, push, update, serverTimestamp } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, tenantDocPath } from '@/core/firebase/paths'
import type { ClassFormValues } from './schema'
import type { ClassStatus } from '@/core/types'

export async function createClass(universityId: string, values: ClassFormValues) {
  const listRef = ref(rtdb, tenantCollectionPath(universityId, 'classes'))
  const newRef = push(listRef)
  await update(newRef, {
    ...values,
    status: 'active' satisfies ClassStatus,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
  return newRef.key as string
}

export async function updateClass(
  universityId: string,
  classId: string,
  values: ClassFormValues
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'classes', classId))
  await update(nodeRef, {
    ...values,
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}

export async function setClassStatus(
  universityId: string,
  classId: string,
  status: ClassStatus
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'classes', classId))
  await update(nodeRef, {
    status,
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}
