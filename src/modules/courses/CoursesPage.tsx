import { useMemo, useState } from 'react'
import { BookOpen, Plus, Pencil } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCreateFromUrl } from '@/shared/hooks/useCreateFromUrl'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { ListPage } from '@/shared/components/ListPage'
import { countLabel, listSubtitle } from '@/shared/utils/plural'
import { usePrograms } from '@/modules/programs/usePrograms'
import { useTeachersList } from '@/modules/teachers/useTeachers'
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

  // Un étudiant ne peut pas lire les enseignants (règles) : pas de colonne
  // Enseignant pour lui, et aucune lecture refusée.
  const canReadTeachers = useCan('teachers', 'read')

  const { courses, loading, error } = useCourses(universityId)
  const { programs } = usePrograms(universityId)
  const allTeachers = useTeachersList(canReadTeachers ? universityId : null)
  const activeTeachers = useMemo(
    () => (allTeachers ?? []).filter((t) => t.accountStatus === 'active'),
    [allTeachers]
  )

  const [formOpen, setFormOpen] = useCreateFromUrl(canCreate)
  const [editing, setEditing] = useState<CourseUnit | null>(null)

  const programName = (programId: string) =>
    programs.find((p) => p.id === programId)?.name ?? '—'
  const teacherCell = (teacherId?: string) => {
    if (!teacherId) return <span className="text-base-content/65">Non attribué</span>
    if (!allTeachers) return null // chargement
    const t = allTeachers.find((t) => t.id === teacherId)
    if (!t) return <span className="text-base-content/65">Enseignant introuvable</span>
    if (t.accountStatus !== 'active') {
      return (
        <>
          {t.lastName} {t.firstName} <span className="text-base-content/65">(inactif)</span>
        </>
      )
    }
    return `${t.lastName} ${t.firstName}`
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
    <ListPage
      title="Cours"
      subtitle={listSubtitle(countLabel(courses.length, 'cours', 'cours'), university?.name)}
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
            Nouveau cours
          </button>
        )
      }
    >

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
                {canReadTeachers && <th>Enseignant</th>}
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
                  {canReadTeachers && (
                    <td className="text-base-content/70">{teacherCell(c.teacherId)}</td>
                  )}
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
        teachers={activeTeachers}
        allTeachers={allTeachers ?? []}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />
    </ListPage>
  )
}
