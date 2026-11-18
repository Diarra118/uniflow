import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/core/firebase/AuthContext'
import { AppShell } from '@/shared/components/AppShell'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { LoginPage } from '@/pages/public/LoginPage'
import { ForgotPasswordPage } from '@/pages/public/ForgotPasswordPage'
import { SignupPage } from '@/pages/public/SignupPage'
import { DashboardPage } from '@/pages/app/DashboardPage'
import { PlatformHomePage } from '@/pages/app/PlatformHomePage'
import { StudentsPage } from '@/modules/students/StudentsPage'
import { StudentProfilePage } from '@/modules/students/StudentProfilePage'
import { MyStudentRecordPage } from '@/modules/students/MyStudentRecordPage'
import { TeachersPage } from '@/modules/teachers/TeachersPage'
import { TeacherProfilePage } from '@/modules/teachers/TeacherProfilePage'
import { ProgramsPage } from '@/modules/programs/ProgramsPage'
import { CoursesPage } from '@/modules/courses/CoursesPage'
import { ClassesPage } from '@/modules/classes/ClassesPage'
import { getHomeRoute } from '@/core/rbac/getHomeRoute'
import { FullPageLoader } from '@/shared/components/States'

function RootRedirect() {
  const { firebaseUser, appUser, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (!firebaseUser) return <Navigate to="/login" replace />
  if (appUser) return <Navigate to={getHomeRoute(appUser.role)} replace />
  return <FullPageLoader />
}

function DashboardIndex() {
  const { appUser } = useAuth()
  if (appUser?.role === 'super_admin_plateforme') {
    return <Navigate to="/app/plateforme" replace />
  }
  return <DashboardPage />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Routes publiques */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
          <Route path="/inscription" element={<SignupPage />} />

          {/* Routes privées */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route
              path="students"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'students', action: 'read' }}>
                  <StudentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="students/:studentId"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'students', action: 'read' }}>
                  <StudentProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="mon-dossier"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'ownStudentRecord', action: 'read' }}>
                  <MyStudentRecordPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="teachers"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'teachers', action: 'read' }}>
                  <TeachersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="teachers/:teacherId"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'teachers', action: 'read' }}>
                  <TeacherProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="programs"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'programs', action: 'read' }}>
                  <ProgramsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="courses"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'courses', action: 'read' }}>
                  <CoursesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="classes"
              element={
                <ProtectedRoute requiredPermission={{ resource: 'classes', action: 'read' }}>
                  <ClassesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="plateforme"
              element={
                <ProtectedRoute
                  requiredPermission={{ resource: 'platformUniversities', action: 'read' }}
                >
                  <PlatformHomePage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
