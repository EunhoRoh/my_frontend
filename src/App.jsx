import { useAuth } from './auth/useAuth'
import LoginPage from './pages/LoginPage'
import StudentPage from './pages/StudentPage'
import TeacherPage from './pages/TeacherPage'
import AdminPage from './pages/AdminPage'
import CommunityDisplayPage from './pages/CommunityDisplayPage'

function FullScreen({ children }) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-emerald-50 text-emerald-700 font-semibold">
      {children}
    </div>
  )
}

// Event-day big screen: open with ?display (or #display). No login required.
function isDisplayMode() {
  return (
    new URLSearchParams(window.location.search).has('display') ||
    window.location.hash.replace('#', '').replace('/', '') === 'display'
  )
}

function App() {
  const { user, loading } = useAuth()

  if (isDisplayMode()) return <CommunityDisplayPage />

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
