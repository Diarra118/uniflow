import { ref, push, update, serverTimestamp } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, tenantDocPath } from '@/core/firebase/paths'
import type { TeacherFormValues } from './schema'
import type { TeacherAccountStatus } from '@/core/types'

function buildSearchKey(values: TeacherFormValues): string {
  return `${values.lastName} ${values.firstName} ${values.employeeNumber}`.trim().toLowerCase()
}

export async function createTeacher(universityId: string, values: TeacherFormValues) {
  const listRef = ref(rtdb, tenantCollectionPath(universityId, 'teachers'))
  const newRef = push(listRef)
  await update(newRef, {
    ...values,
    accountStatus: 'active' satisfies TeacherAccountStatus,
    searchKey: buildSearchKey(values),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
  return newRef.key as string
}

export async function updateTeacher(
  universityId: string,
  teacherId: string,
  values: TeacherFormValues
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'teachers', teacherId))
  await update(nodeRef, {
    ...values,
    searchKey: buildSearchKey(values),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}

export async function setTeacherAccountStatus(
  universityId: string,
  teacherId: string,
  accountStatus: TeacherAccountStatus
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'teachers', teacherId))
  await update(nodeRef, {
    accountStatus,
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}
