import { useState } from 'react'
import { BookOpen, Plus, Pencil } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { usePrograms } from '@/modules/programs/usePrograms'
import { useActiveTeachersList } from '@/modules/teachers/useTeachers'
import { useCourses } from './useCourses'
import { createCourse, updateCourse } from './api'
import { CourseFormModal } from './CourseFormModal'
import type { CourseUnit } from '@/core/types'
import type { CourseFormValues } from './schema'

export function CoursesPage() {
  const { appUser, university } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canCreate = useCan('courses', 'create')
  const canUpdate = useCan('courses', 'update')

  const { courses, loading, error } = useCourses(universityId)
  const { programs } = usePrograms(universityId)
  const teachers = useActiveTeachersList(universityId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CourseUnit | null>(null)

  const programName = (programId: string) =>
    programs.find((p) => p.id === programId)?.name ?? '—'
  const teacherName = (teacherId?: string) => {
    if (!teacherId) return '—'
    const t = teachers.find((t) => t.id === teacherId)
    return t ? `${t.lastName} ${t.firstName}` : '—'
  }

  async function handleSubmit(values: CourseFormValues) {
    if (!universityId) return
    if (editing) {
      await updateCourse(universityId, editing.id, values)
    } else {
      await createCourse(universityId, values)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Cours</h1>
          <p className="text-sm text-base-content/60">
            {courses.length} cours — {university?.name}
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
            Nouveau cours
          </button>
        )}
      </div>

      {loading && <TableSkeleton cols={5} />}
      {!loading && error && <ErrorState description={error} />}

      {!loading && !error && courses.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="Aucun cours pour le moment"
          description={
            canCreate
              ? 'Créez votre premier cours et rattachez-le à une filière.'
              : "Aucun cours n'a encore été créé."
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
                Nouveau cours
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && courses.length > 0 && (
        <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Nom</th>
                <th>Filière</th>
                <th>Enseignant</th>
                <th>Crédits</th>
                {canUpdate && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="hover">
                  <td className="font-mono-data text-xs">{c.code}</td>
                  <td>{c.name}</td>
                  <td className="text-base-content/70">{programName(c.programId)}</td>
                  <td className="text-base-content/70">{teacherName(c.teacherId)}</td>
                  <td className="text-base-content/70">{c.credits ?? '—'}</td>
                  {canUpdate && (
                    <td className="text-right">
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CourseFormModal
        open={formOpen}
        course={editing}
        programs={programs}
        teachers={teachers}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
