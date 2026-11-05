import { ref, push, update, serverTimestamp } from 'firebase/database'
import { rtdb } from '@/core/firebase/config'
import { tenantCollectionPath, tenantDocPath } from '@/core/firebase/paths'
import type { ProgramFormValues } from './schema'
import type { ProgramStatus } from '@/core/types'

export async function createProgram(universityId: string, values: ProgramFormValues) {
  const listRef = ref(rtdb, tenantCollectionPath(universityId, 'programs'))
  const newRef = push(listRef)
  await update(newRef, {
    ...values,
    status: 'active' satisfies ProgramStatus,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
  return newRef.key as string
}

export async function updateProgram(
  universityId: string,
  programId: string,
  values: ProgramFormValues
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'programs', programId))
  await update(nodeRef, {
    ...values,
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}

export async function setProgramStatus(
  universityId: string,
  programId: string,
  status: ProgramStatus
) {
  const nodeRef = ref(rtdb, tenantDocPath(universityId, 'programs', programId))
  await update(nodeRef, {
    status,
    updatedAt: Date.now(),
    _updatedAt: serverTimestamp(),
  })
}
