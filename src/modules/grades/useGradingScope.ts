import { useMemo } from 'react'
import { useAuth } from '@/core/firebase/AuthContext'
import type { CourseUnit, Program, StudentProfile, TeacherProfile } from '@/core/types'
import { useTenantRows } from '@/modules/dashboard/useDashboardData'
import { byId, coursesOfTeacher } from '@/modules/dashboard/stats'

/**
 * Périmètre de la page Notes : l'admin voit tous les cours de son
 * université, l'enseignant les cours dont il est responsable
 * (courses.teacherId = id de sa fiche). Étudiants et filières servent à
 * construire les listes à noter (lecture ouverte à ces deux rôles).
 */
export function useGradingScope() {
  const { appUser } = useAuth()
  const uid = appUser?.universityId ?? null
  const isAdmin = appUser?.role === 'admin_universite'
  const linkedId = appUser?.linkedRecordType === 'teacher' ? (appUser.linkedRecordId ?? null) : null

  const courses = useTenantRows<CourseUnit>(uid, 'courses')
  const programs = useTenantRows<Program>(uid, 'programs')
  const students = useTenantRows<StudentProfile>(uid, 'students')
  // Comptes créés avant le lien de fiche : fiche retrouvée par son uid.
  const teachers = useTenantRows<TeacherProfile>(!isAdmin && !linkedId ? uid : null, 'teachers')

  const teacherId = isAdmin ? null : (linkedId ?? teachers.data?.find((t) => t.uid === appUser?.uid)?.id ?? null)
  const recordResolved = isAdmin || linkedId !== null || teachers.data !== null

  const scopeCourses = useMemo(() => {
    if (!courses.data || !recordResolved) return null
    if (isAdmin) return [...courses.data].sort((a, b) => a.code.localeCompare(b.code))
    return coursesOfTeacher(courses.data, teacherId)
  }, [courses.data, recordResolved, isAdmin, teacherId])

  const programById = useMemo(() => byId(programs.data ?? []), [programs.data])

  return {
    universityId: uid,
    isAdmin,
    teacherId,
    courses: scopeCourses,
    allCourses: courses.data,
    students: students.data,
    programById,
    error: courses.error || programs.error || students.error || teachers.error,
  }
}
