import { ref, push, update, serverTimestamp } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, tenantDocPath } from '@/core/firebase/paths'
import type { StudentFormValues } from './schema'
import type { StudentAccountStatus } from '@/core/types'

function buildSearchKey(values: StudentFormValues): string {
  return `${values.lastName} ${values.firstName} ${values.studentNumber}`
    .trim()
    .toLowerCase()
}

export async function createStudent(universityId: string, values: StudentFormValues) {
  const listRef = ref(rtdb, tenantCollectionPath(universityId, 'students'))
  const newRef = push(listRef)
  await update(newRef, {
    ...values,
    accountStatus: 'active' satisfies StudentAccountStatus,
    searchKey: buildSearchKey(values),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
  return newRef.key as string
}

export async function updateStudent(
  universityId: string,
  studentId: string,
  values: StudentFormValues
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'students', studentId))
  await update(nodeRef, {
    ...values,
    searchKey: buildSearchKey(values),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}

export async function setStudentAccountStatus(
  universityId: string,
  studentId: string,
  accountStatus: StudentAccountStatus
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'students', studentId))
  await update(nodeRef, {
    accountStatus,
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}
