import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import AppHeader from '../components/AppHeader'

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center">
      <p className={`text-2xl font-extrabold ${accent}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function AdminPage() {
  const { data: stats } = usePolling(() => apiFetch('/admin/stats/'), 8000)
  const users = usePolling(() => apiFetch('/admin/users/'), 8000)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const teachers = users.data?.teachers ?? []
  const students = users.data?.students ?? []

  const assign = async (studentId, teacherId) => {
    setBusy(studentId)
    setError('')
    try {
      await apiFetch('/admin/assign/', {
        method: 'POST',
        body: { student: studentId, teacher: teacherId || null },
      })
      await users.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const setRole = async (userId, role) => {
    setBusy(`role-${userId}`)
    setError('')
    try {
      await apiFetch('/admin/set-role/', { method: 'POST', body: { user: userId, role } })
      await users.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-svh bg-gray-50 px-4 py-4">
      <div className="max-w-4xl mx-auto space-y-5">
        <AppHeader title="관리자 대시보드" />

        {/* 통계 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="학생" value={stats?.student_count ?? '–'} accent="text-emerald-600" />
          <StatCard label="선생님" value={stats?.teacher_count ?? '–'} accent="text-sky-600" />
          <StatCard label="총 지급 달란트" value={stats?.total_received ?? '–'} accent="text-amber-600" />
          <StatCard label="총 기부 달란트" value={stats?.total_donated ?? '–'} accent="text-rose-500" />
        </div>

        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        {/* 선생님 목록 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-bold text-sky-700 border-b border-gray-100">
            선생님 ({teachers.length}명)
          </h2>
          {teachers.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">등록된 선생님이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {teachers.map((t) => (
                <li key={t.id} className="px-5 py-3 flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800">{t.username}</span>
                  <button
                    type="button"
                    onClick={() => setRole(t.id, 'student')}
                    disabled={busy === `role-${t.id}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                  >
                    학생으로 변경
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 학생 목록 + 선생님 배정 */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-bold text-emerald-700 border-b border-gray-100">
            학생 ({students.length}명) · 선생님 배정 / 권한
          </h2>
          {students.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">등록된 학생이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {students.map((s) => (
                <li key={s.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-800">{s.username}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      받음 {s.received_talent} · 기부 {s.donated_talent}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={s.teacher ?? ''}
                      onChange={(e) => assign(s.id, e.target.value)}
                      disabled={busy === s.id}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
                    >
                      <option value="">담당 없음</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.username} 선생님</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setRole(s.id, 'teacher')}
                      disabled={busy === `role-${s.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 disabled:opacity-50"
                    >
                      선생님으로
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-gray-400 text-center">
          더 세밀한 관리는{' '}
          <a href="/admin/" className="text-emerald-600 underline" target="_blank" rel="noreferrer">
            Django 관리자 페이지
          </a>
          에서 할 수 있어요.
        </p>
      </div>
    </div>
  )
}

export default AdminPage
