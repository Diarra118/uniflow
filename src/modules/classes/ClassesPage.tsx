import { useState } from 'react'
import { Rows3, Plus, Pencil, Power } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { ListPage, listSubtitle } from '@/shared/components/ListPage'
import { countLabel } from '@/shared/utils/plural'
import { usePrograms } from '@/modules/programs/usePrograms'
import { useClasses } from './useClasses'
import { createClass, updateClass, setClassStatus } from './api'
import { ClassFormModal } from './ClassFormModal'
import type { ClassGroup } from '@/core/types'
import type { ClassFormValues } from './schema'

export function ClassesPage() {
  const { appUser, university } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canCreate = useCan('classes', 'create')
  const canUpdate = useCan('classes', 'update')

  const { classes, loading, error } = useClasses(universityId)
  const { programs } = usePrograms(universityId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClassGroup | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const programName = (programId: string) =>
    programs.find((p) => p.id === programId)?.name ?? '—'

  async function handleSubmit(values: ClassFormValues) {
    if (!universityId) return
    if (editing) {
      await updateClass(universityId, editing.id, values)
    } else {
      await createClass(universityId, values)
    }
  }

  async function handleToggle(classGroup: ClassGroup) {
    if (!universityId) return
    setTogglingId(classGroup.id)
    try {
      await setClassStatus(
        universityId,
        classGroup.id,
        classGroup.status === 'active' ? 'inactive' : 'active'
      )
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <ListPage
      title="Classes"
      subtitle={listSubtitle(countLabel(classes.length, 'classe'), university?.name)}
      action={
        canCreate && (
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={15} />
            Nouvelle classe
          </button>
        )
      }
    >

      {loading && <TableSkeleton cols={5} />}
      {!loading && error && <ErrorState description={error} />}

      {!loading && !error && classes.length === 0 && (
        <EmptyState
          icon={Rows3}
          title="Aucune classe pour le moment"
          description={
            canCreate
              ? 'Créez votre première classe et rattachez-la à une filière.'
              : "Aucune classe n'a encore été créée."
          }
          action={
            canCreate ? (
              <button
                className="btn btn-primary btn-sm gap-2"
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus size={15} />
                Nouvelle classe
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Filière</th>
                <th>Niveau</th>
                <th>Année académique</th>
                <th>Statut</th>
                {canUpdate && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.id} className="hover">
                  <td>{c.name}</td>
                  <td className="text-base-content/70">{programName(c.programId)}</td>
                  <td className="text-base-content/70">{c.level || '—'}</td>
                  <td className="text-base-content/70">{c.academicYearLabel || '—'}</td>
                  <td>
                    <span
                      className={`badge badge-sm ${c.status === 'active' ? 'badge-outline badge-success' : 'badge-outline'}`}
                    >
                      {c.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canUpdate && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn btn-ghost btn-xs btn-circle"
                          onClick={() => handleToggle(c)}
                          disabled={togglingId === c.id}
                          aria-label="Activer/Désactiver"
                        >
                          <Power size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs btn-circle"
                          onClick={() => {
                            setEditing(c)
                            setFormOpen(true)
                          }}
                          aria-label="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClassFormModal
        open={formOpen}
        classGroup={editing}
        programs={programs}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </ListPage>
  )
}
