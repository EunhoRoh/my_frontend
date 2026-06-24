import { useAuth } from '../auth/useAuth'

const ROLE_BADGE = {
  student: { label: '학생', cls: 'bg-emerald-100 text-emerald-700' },
  teacher: { label: '선생님', cls: 'bg-sky-100 text-sky-700' },
  admin: { label: '관리자', cls: 'bg-amber-100 text-amber-700' },
}

function AppHeader({ title }) {
  const { user, logout } = useAuth()
  const badge = ROLE_BADGE[user?.role] ?? ROLE_BADGE.student

  return (
    <header className="flex items-center justify-between gap-3 px-1 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-lg font-extrabold text-gray-800 truncate">{title}</h1>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-gray-600 hidden sm:inline">
          {user?.username}
        </span>
        <button
          type="button"
          onClick={logout}
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          로그아웃
        </button>
      </div>
    </header>
  )
}

export default AppHeader
