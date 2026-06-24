import { useAuth } from './auth/useAuth'
import LoginPage from './pages/LoginPage'
import StudentPage from './pages/StudentPage'
import TeacherPage from './pages/TeacherPage'
import AdminPage from './pages/AdminPage'

function FullScreen({ children }) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-emerald-50 text-emerald-700 font-semibold">
      {children}
    </div>
  )
}

function App() {
  const { user, loading } = useAuth()

  if (loading) return <FullScreen>🌱 불러오는 중…</FullScreen>
  if (!user) return <LoginPage />

  switch (user.role) {
    case 'teacher':
      return <TeacherPage />
    case 'admin':
      return <AdminPage />
    case 'student':
    default:
      return <StudentPage />
  }
}

export default App
