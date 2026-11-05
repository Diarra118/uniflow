import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Plus, Search, ChevronRight } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { EmptyState, ErrorState, TableSkeleton } from '@/shared/components/States'
import { useStudents } from './useStudents'
import { createStudent } from './api'
import { StudentFormModal } from './StudentFormModal'
import {
  ENROLLMENT_STATUS_BADGE,
  ENROLLMENT_STATUS_LABELS,
  type StudentFormValues,
} from './schema'
import type { EnrollmentStatus } from '@/core/types'
import { useCreateLoginAccess } from '@/modules/accounts/useCreateLoginAccess'
import { AccountInvitationDialog } from '@/modules/accounts/AccountInvitationDialog'

type StatusFilter = 'all' | EnrollmentStatus

export function StudentsPage() {
  const { appUser } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canCreate = useCan('students', 'create')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)

  const { students, loading, error, hasMore, isSearching, loadMore } = useStudents(
    universityId,
    search
  )

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return students
    return students.filter((s) => s.enrollmentStatus === statusFilter)
  }, [students, statusFilter])

  const access = useCreateLoginAccess()
  const [accessFailedFor, setAccessFailedFor] = useState<string | null>(null)

  async function handleCreate(values: StudentFormValues, options: { createLoginAccess: boolean }) {
    if (!universityId) return
    const studentId = await createStudent(universityId, values)
    // La fiche est enregistrée : un échec de création d'accès ne doit pas la
    // faire passer pour un échec d'enregistrement (create ne lève jamais).
    if (options.createLoginAccess) {
      const ok = await access.create({
        recordType: 'student',
        recordId: studentId,
        name: `${values.firstName} ${values.lastName}`,
        email: values.email,
      })
      setAccessFailedFor(ok ? null : studentId)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Étudiants</h1>
          <p className="text-sm text-base-content/60">
            {students.length} étudiant(s) {isSearching ? 'trouvé(s)' : 'chargé(s)'}
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary btn-sm gap-2" onClick={() => setFormOpen(true)}>
            <Plus size={15} />
            Nouvel étudiant
          </button>
        )}
      </div>

      {accessFailedFor && access.error && (
        <div className="alert alert-warning mb-4 text-sm">
          <span>
            Fiche créée, mais l'accès de connexion n'a pas été créé : {access.error} Vous pouvez
            réessayer depuis{' '}
            <Link to={`/app/students/${accessFailedFor}`} className="link">
              la fiche de l'étudiant
            </Link>
            .
          </span>
          <button className="btn btn-ghost btn-xs" onClick={() => setAccessFailedFor(null)}>
            Fermer
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="input input-bordered flex w-full max-w-xs items-center gap-2">
          <Search size={15} className="text-base-content/40" />
          <input
            className="grow"
            placeholder="Rechercher un nom, prénom, matricule..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <select
          className="select select-bordered select-sm w-full max-w-[200px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(ENROLLMENT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading && <TableSkeleton cols={4} />}

      {!loading && error && <ErrorState description={error} />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title={search || statusFilter !== 'all' ? 'Aucun résultat' : 'Aucun étudiant pour le moment'}
          description={
            search || statusFilter !== 'all'
              ? 'Essayez un autre terme ou un autre filtre.'
              : canCreate
                ? 'Ajoutez votre premier étudiant pour commencer.'
                : "Aucun étudiant n'a encore été enregistré."
          }
          action={
            !search && statusFilter === 'all' && canCreate ? (
              <button className="btn btn-primary btn-sm gap-2" onClick={() => setFormOpen(true)}>
                <Plus size={15} />
                Nouvel étudiant
              </button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Statut</th>
                  <th className="text-right">Compte</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="hover">
                    <td className="font-mono-data text-xs">{s.studentNumber}</td>
                    <td>
                      {s.lastName} {s.firstName}
                    </td>
                    <td className="text-base-content/70">{s.email}</td>
                    <td>
                      <span className={`badge badge-sm ${ENROLLMENT_STATUS_BADGE[s.enrollmentStatus]}`}>
                        {ENROLLMENT_STATUS_LABELS[s.enrollmentStatus]}
                      </span>
                    </td>
                    <td className="text-right">
                      <span
                        className={`badge badge-sm ${s.accountStatus === 'active' ? 'badge-outline badge-success' : 'badge-outline'}`}
                      >
                        {s.accountStatus === 'active' ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/app/students/${s.id}`}
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

          {isSearching && (
            <p className="mt-3 text-center text-xs text-base-content/40">
              Résultats de recherche sur nom, prénom et matricule.
            </p>
          )}
        </>
      )}

      <StudentFormModal
        open={formOpen}
        student={null}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />

      <AccountInvitationDialog info={access.invitation} onClose={access.dismissInvitation} />
    </div>
  )
}
