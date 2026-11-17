import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Plus, Search, ChevronRight } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { ListPage, listSubtitle } from '@/shared/components/ListPage'
import { countLabel } from '@/shared/utils/plural'
import { useTeachers } from './useTeachers'
import { createTeacher } from './api'
import { TeacherFormModal } from './TeacherFormModal'
import type { TeacherFormValues } from './schema'
import { useCreateLoginAccess } from '@/modules/accounts/useCreateLoginAccess'
import { AccountInvitationDialog } from '@/modules/accounts/AccountInvitationDialog'

export function TeachersPage() {
  const { appUser, university } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canCreate = useCan('teachers', 'create')

  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const { teachers, loading, error, hasMore, loadMore } = useTeachers(
    universityId,
    search
  )

  const access = useCreateLoginAccess()
  const [accessFailedFor, setAccessFailedFor] = useState<string | null>(null)

  async function handleCreate(values: TeacherFormValues, options: { createLoginAccess: boolean }) {
    if (!universityId) return
    const teacherId = await createTeacher(universityId, values)
    // Voir StudentsPage : la fiche reste créée même si l'accès échoue.
    if (options.createLoginAccess) {
      const ok = await access.create({
        recordType: 'teacher',
        recordId: teacherId,
        name: `${values.firstName} ${values.lastName}`,
        email: values.email,
      })
      setAccessFailedFor(ok ? null : teacherId)
    }
  }

  return (
    <ListPage
      title="Enseignants"
      subtitle={listSubtitle(
        countLabel(teachers.length, 'enseignant', 'enseignants', hasMore),
        university?.name
      )}
      action={
        canCreate && (
          <button className="btn btn-primary btn-sm gap-2" onClick={() => setFormOpen(true)}>
            <Plus size={15} />
            Nouvel enseignant
          </button>
        )
      }
    >

      {accessFailedFor && access.error && (
        <div className="alert alert-warning mb-4 text-sm">
          <span>
            Fiche créée, mais l'accès de connexion n'a pas été créé : {access.error} Vous pouvez
            réessayer depuis{' '}
            <Link to={`/app/teachers/${accessFailedFor}`} className="link">
              la fiche de l'enseignant
            </Link>
            .
          </span>
          <button className="btn btn-ghost btn-xs" onClick={() => setAccessFailedFor(null)}>
            Fermer
          </button>
        </div>
      )}

      <label className="input input-bordered mb-4 flex w-full max-w-xs items-center gap-2">
        <Search size={15} className="text-base-content/40" />
        <input
          className="grow"
          placeholder="Rechercher un nom, prénom, matricule..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>

      {loading && <TableSkeleton cols={4} />}
      {!loading && error && <ErrorState description={error} />}

      {!loading && !error && teachers.length === 0 && (
        <EmptyState
          icon={Users}
          title={search ? 'Aucun résultat' : 'Aucun enseignant pour le moment'}
          description={
            search
              ? 'Essayez un autre terme de recherche.'
              : canCreate
                ? 'Ajoutez votre premier enseignant pour commencer.'
                : "Aucun enseignant n'a encore été enregistré."
          }
          action={
            !search && canCreate ? (
              <button className="btn btn-primary btn-sm gap-2" onClick={() => setFormOpen(true)}>
                <Plus size={15} />
                Nouvel enseignant
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && teachers.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Département</th>
                  <th className="text-right">Compte</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {teachers.map((t) => (
                  <tr key={t.id} className="hover">
                    <td className="font-mono-data text-xs">{t.employeeNumber}</td>
                    <td>
                      {t.lastName} {t.firstName}
                    </td>
                    <td className="text-base-content/70">{t.email}</td>
                    <td className="text-base-content/70">{t.department || '—'}</td>
                    <td className="text-right">
                      <span
                        className={`badge badge-sm ${t.accountStatus === 'active' ? 'badge-outline badge-success' : 'badge-outline'}`}
                      >
                        {t.accountStatus === 'active' ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/app/teachers/${t.id}`}
                        className="btn btn-ghost btn-xs btn-circle"
                        aria-label="Voir le profil"
                      >
                        <ChevronRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button className="btn btn-outline btn-sm" onClick={loadMore}>
                Charger plus
              </button>
            </div>
          )}
        </>
      )}

      <TeacherFormModal
        open={formOpen}
        teacher={null}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />

      <AccountInvitationDialog info={access.invitation} onClose={access.dismissInvitation} />
    </ListPage>
  )
}
