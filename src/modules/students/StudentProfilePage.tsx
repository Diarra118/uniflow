import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, GraduationCap, Power } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { useCan } from '@/core/rbac/useCan'
import { ContentLoader, EmptyState, ErrorState } from '@/shared/components/States'
import { useStudent } from './useStudents'
import { updateStudent, setStudentAccountStatus } from './api'
import { StudentFormModal } from './StudentFormModal'
import { ENROLLMENT_STATUS_TONE, ENROLLMENT_STATUS_LABELS, type StudentFormValues } from './schema'
import { StatusBadge } from '@/shared/components/StatusBadge'
import { activeTone } from '@/shared/utils/statusTone'
import { usePrograms } from '@/modules/programs/usePrograms'
import { useClasses } from '@/modules/classes/useClasses'
import { LoginAccessCard } from '@/modules/accounts/LoginAccessCard'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'

/**
 * Fiche étudiant. Sans prop : identifiant lu dans l'URL (vue admin/enseignant).
 * Avec `studentId` : vue « Mon dossier » d'un étudiant sur sa propre fiche
 * (pas de lien vers la liste, qu'il ne peut pas lire).
 */
export function StudentProfilePage({ studentId: ownStudentId }: { studentId?: string } = {}) {
  const params = useParams<{ studentId: string }>()
  const studentId = ownStudentId ?? params.studentId
  const isOwnRecord = ownStudentId !== undefined
  const { appUser } = useAuth()
  const universityId = appUser?.universityId ?? null

  const canUpdate = useCan('students', 'update')

  const { student, loading, error } = useStudent(universityId, studentId)
  const { programs } = usePrograms(universityId)
  const { classes } = useClasses(universityId)
  const [formOpen, setFormOpen] = useState(false)
  const [togglingStatus, setTogglingStatus] = useState(false)
  useDocumentTitle(isOwnRecord ? 'Mon dossier' : 'Fiche étudiant')

  if (loading) return <ContentLoader label="Chargement de la fiche…" />
  if (error) return <ErrorState description={error} />
  if (!student) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Étudiant introuvable"
        description="Ce profil n'existe pas ou a été supprimé."
      />
    )
  }

  async function handleUpdate(values: StudentFormValues) {
    if (!universityId || !student) return
    await updateStudent(universityId, student.id, values)
  }

  async function handleToggleStatus() {
    if (!universityId || !student) return
    setTogglingStatus(true)
    try {
      await setStudentAccountStatus(
        universityId,
        student.id,
        student.accountStatus === 'active' ? 'inactive' : 'active'
      )
    } finally {
      setTogglingStatus(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {isOwnRecord ? (
        <h2 className="mb-4 text-sm font-medium text-base-content/70">Mon dossier</h2>
      ) : (
        <Link
          to="/app/students"
          className="mb-4 inline-flex items-center gap-1 text-sm text-base-content/70 hover:text-base-content"
        >
          <ArrowLeft size={15} />
          Retour à la liste
        </Link>
      )}

      <div className="flex flex-col gap-4 rounded-box border border-base-300 bg-base-100 p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <GraduationCap size={24} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold">
              {student.firstName} {student.lastName}
            </h1>
            <p className="font-mono-data text-sm text-base-content/65">{student.studentNumber}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge tone={ENROLLMENT_STATUS_TONE[student.enrollmentStatus]}>
                {ENROLLMENT_STATUS_LABELS[student.enrollmentStatus]}
              </StatusBadge>
              <StatusBadge tone={activeTone(student.accountStatus === 'active')}>
                Compte {student.accountStatus === 'active' ? 'actif' : 'inactif'}
              </StatusBadge>
            </div>
          </div>
        </div>

        {canUpdate && (
          <div className="flex shrink-0 gap-2">
            <button
              className="btn btn-outline btn-sm gap-2"
              onClick={handleToggleStatus}
              disabled={togglingStatus}
            >
              <Power size={14} />
              {student.accountStatus === 'active' ? 'Désactiver' : 'Activer'}
            </button>
            <button className="btn btn-primary btn-sm gap-2" onClick={() => setFormOpen(true)}>
              <Pencil size={14} />
              Modifier
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoCard label="E-mail" value={student.email} />
        <InfoCard
          label="Filière"
          value={programs.find((p) => p.id === student.programId)?.name || '—'}
        />
        <InfoCard
          label="Classe"
          value={classes.find((c) => c.id === student.classId)?.name || '—'}
        />
        <InfoCard
          label="Dernière mise à jour"
          value={new Date(student.updatedAt).toLocaleDateString('fr-FR')}
        />
      </div>

      {!isOwnRecord && (
        <div className="mt-4">
          <LoginAccessCard
            recordType="student"
            recordId={student.id}
            uid={student.uid}
            name={`${student.firstName} ${student.lastName}`}
            email={student.email}
            canManage={canUpdate}
          />
        </div>
      )}

      <StudentFormModal
        open={formOpen}
        student={student}
        onClose={() => setFormOpen(false)}
        onSubmit={handleUpdate}
      />
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <p className="text-xs text-base-content/65">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}
