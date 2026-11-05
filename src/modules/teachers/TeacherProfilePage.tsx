import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Users, Power } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, FullPageLoader } from '@/shared/components/States'
import { useTeacher } from './useTeachers'
import { updateTeacher, setTeacherAccountStatus } from './api'
import { TeacherFormModal } from './TeacherFormModal'
import type { TeacherFormValues } from './schema'
import { LoginAccessCard } from '@/modules/accounts/LoginAccessCard'

export function TeacherProfilePage() {
  const { teacherId } = useParams<{ teacherId: string }>()
  const { appUser } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canUpdate = useCan('teachers', 'update')

  const { teacher, loading, error } = useTeacher(universityId, teacherId)
  const [formOpen, setFormOpen] = useState(false)
  const [toggling, setToggling] = useState(false)

  if (loading) return <FullPageLoader />
  if (error) return <ErrorState description={error} />
  if (!teacher) {
    return (
      <EmptyState
        icon={Users}
        title="Enseignant introuvable"
        description="Ce profil n'existe pas ou a été supprimé."
      />
    )
  }

  async function handleUpdate(values: TeacherFormValues) {
    if (!universityId || !teacher) return
    await updateTeacher(universityId, teacher.id, values)
  }

  async function handleToggleStatus() {
    if (!universityId || !teacher) return
    setToggling(true)
    try {
      await setTeacherAccountStatus(
        universityId,
        teacher.id,
        teacher.accountStatus === 'active' ? 'inactive' : 'active'
      )
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/app/teachers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-base-content/60 hover:text-base-content"
      >
        <ArrowLeft size={15} />
        Retour à la liste
      </Link>

      <div className="flex flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users size={24} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold">
              {teacher.firstName} {teacher.lastName}
            </h1>
            <p className="font-mono-data text-sm text-base-content/50">{teacher.employeeNumber}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={`badge badge-sm ${teacher.accountStatus === 'active' ? 'badge-outline badge-success' : 'badge-outline'}`}
              >
                Compte {teacher.accountStatus === 'active' ? 'actif' : 'inactif'}
              </span>
            </div>
          </div>
        </div>

        {canUpdate && (
          <div className="flex shrink-0 gap-2">
            <button
              className="btn btn-outline btn-sm gap-2"
              onClick={handleToggleStatus}
              disabled={toggling}
            >
              <Power size={14} />
              {teacher.accountStatus === 'active' ? 'Désactiver' : 'Activer'}
            </button>
            <button className="btn btn-primary btn-sm gap-2" onClick={() => setFormOpen(true)}>
              <Pencil size={14} />
              Modifier
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoCard label="Email" value={teacher.email} />
        <InfoCard label="Département" value={teacher.department || '—'} />
        <InfoCard
          label="Dernière mise à jour"
          value={new Date(teacher.updatedAt).toLocaleDateString('fr-FR')}
        />
      </div>

      <div className="mt-4">
        <LoginAccessCard
          recordType="teacher"
          recordId={teacher.id}
          uid={teacher.uid}
          name={`${teacher.firstName} ${teacher.lastName}`}
          email={teacher.email}
          canManage={canUpdate}
        />
      </div>

      <TeacherFormModal
        open={formOpen}
        teacher={teacher}
        onClose={() => setFormOpen(false)}
        onSubmit={handleUpdate}
      />
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <p className="text-xs text-base-content/50">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
