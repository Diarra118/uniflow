import { useState } from 'react'
import { Layers, Plus, Pencil, Power } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { usePrograms } from './usePrograms'
import { createProgram, updateProgram, setProgramStatus } from './api'
import { ProgramFormModal } from './ProgramFormModal'
import type { Program } from '@/core/types'
import type { ProgramFormValues } from './schema'

export function ProgramsPage() {
  const { appUser, university } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canCreate = useCan('programs', 'create')
  const canUpdate = useCan('programs', 'update')

  const { programs, loading, error } = usePrograms(universityId)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Program | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleSubmit(values: ProgramFormValues) {
    if (!universityId) return
    if (editing) {
      await updateProgram(universityId, editing.id, values)
    } else {
      await createProgram(universityId, values)
    }
  }

  async function handleToggle(program: Program) {
    if (!universityId) return
    setTogglingId(program.id)
    try {
      await setProgramStatus(universityId, program.id, program.status === 'active' ? 'inactive' : 'active')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Filières</h1>
          <p className="text-sm text-base-content/60">
            {programs.length} filière(s) — {university?.name}
          </p>
        </div>
        {canCreate && (
          <button
            className="btn btn-primary btn-sm gap-2"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={15} />
            Nouvelle filière
          </button>
        )}
      </div>

      {loading && <TableSkeleton cols={4} />}
      {!loading && error && <ErrorState description={error} />}

      {!loading && !error && programs.length === 0 && (
        <EmptyState
          icon={Layers}
          title="Aucune filière pour le moment"
          description={
            canCreate
              ? 'Créez votre première filière pour pouvoir y rattacher des cours et des classes.'
              : "Aucune filière n'a encore été créée."
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
                Nouvelle filière
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && programs.length > 0 && (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Nom</th>
                <th>Durée</th>
                <th>Statut</th>
                {canUpdate && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="hover">
                  <td className="font-mono-data text-xs">{p.code}</td>
                  <td>{p.name}</td>
                  <td className="text-base-content/70">{p.durationYears} an(s)</td>
                  <td>
                    <span
                      className={`badge badge-sm ${p.status === 'active' ? 'badge-outline badge-success' : 'badge-outline'}`}
                    >
                      {p.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canUpdate && (
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn btn-ghost btn-xs btn-circle"
                          onClick={() => handleToggle(p)}
                          disabled={togglingId === p.id}
                          aria-label="Activer/Désactiver"
                        >
                          <Power size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-xs btn-circle"
                          onClick={() => {
                            setEditing(p)
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

      <ProgramFormModal
        open={formOpen}
        program={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
