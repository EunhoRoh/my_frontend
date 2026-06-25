import { useAuth } from '../auth/useAuth'

const ROLE_BADGE = {
  student: { label: '학생', cls: 'bg-emerald-100 text-emerald-700' },
  teacher: { label: '선생님', cls: 'bg-sky-100 text-sky-700' },
  admin: { label: '관리자', cls: 'bg-amber-100 text-amber-700' },
}

function AppHeader({ title }) {
  const { user, logout } = useAuth()
  const badge = ROLE_BADGE[user?.role] ?? ROLE_BADGE.student
  const name = user?.username ?? ''

  return (
    <header className="flex items-center justify-between gap-3 px-1 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-lg font-extrabold text-gray-800 truncate">{name}</span>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {title && <p className="text-xs text-gray-400 truncate leading-tight">{title}</p>}
      </div>
      <button
        type="button"
        onClick={logout}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 active:scale-95 transition"
      >
        로그아웃
      </button>
    </header>
  )
}

export default AppHeader
