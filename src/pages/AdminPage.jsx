import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import AppHeader from '../components/AppHeader'

// 기기 시간대와 무관하게 한국시간으로 표시한다(결산 기준이 서버의 한국시간과 같아야 한다).
function formatDateTime(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center">
      <p className={`text-2xl font-extrabold ${accent}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function AdminPage() {
  const statsPoll = usePolling(() => apiFetch('/admin/stats/'), 12000)
  const stats = statsPoll.data
  const users = usePolling(() => apiFetch('/admin/users/'), 12000)
  const donations = usePolling(() => apiFetch('/admin/donations/'), 12000)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const teachers = users.data?.teachers ?? []
  const students = users.data?.students ?? []
  const donationList = donations.data ?? []
  const isMarket = stats?.mode === 'market'

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

  const removeUser = async (id, name, role) => {
    const msg = role === 'teacher'
      ? `${name} 선생님을 삭제할까요?\n이 선생님이 준 달란트 기록도 함께 사라지고, 담당 학생은 '담당 없음'이 됩니다.\n되돌릴 수 없어요.`
      : `${name} 학생을 삭제할까요?\n이 학생의 받은 달란트·기부 기록도 함께 사라집니다.\n되돌릴 수 없어요.`
    if (!window.confirm(msg)) return
    setBusy(`del-${id}`)
    setError('')
    try {
      await apiFetch('/admin/delete-user/', { method: 'POST', body: { user: id } })
      await users.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const saveConfig = async (body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy('config')
    setError('')
    try {
      await apiFetch('/admin/config/', { method: 'POST', body })
      await statsPoll.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const resetData = async () => {
    if (!window.confirm(
      '모든 학생의 달란트·기부·결제 데이터를 0으로 초기화할까요?\n계정은 그대로 유지됩니다. 되돌릴 수 없어요.'
    )) return
    setBusy('reset')
    setError('')
    try {
      const r = await apiFetch('/admin/reset-talents/', { method: 'POST' })
      await users.refresh()
      window.alert(
        `초기화 완료 — 지급 ${r.deleted_grants}건 · 기부 ${r.deleted_donations}건 · ` +
        `결제 ${r.deleted_purchases}건 삭제됨`
      )
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

        {isMarket && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="상점에 낸 달란트" value={stats?.total_spent ?? '–'} accent="text-orange-500" />
            <StatCard label="확인 대기" value={stats?.pending_purchases ?? '–'} accent="text-rose-500" />
          </div>
        )}

        {/* 운영 모드 — 행사 당일 화면 전체를 갈아끼운다 */}
        <section className={`rounded-2xl border shadow-sm px-5 py-4 ${
          isMarket ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-bold text-gray-800">운영 모드</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isMarket
                  ? '달란트 시장 — 기부는 멈추고 상점 결제가 열려 있어요.'
                  : '기본 — 선생님 지급과 공동체 나무 기부가 열려 있어요.'}
              </p>
            </div>
            <button
              type="button"
              disabled={busy === 'config' || !stats}
              onClick={() => saveConfig(
                { mode: isMarket ? 'classic' : 'market' },
                isMarket
                  ? (stats?.pending_purchases > 0
                      // 대기 결제를 남긴 채 닫으면 아이 화면(클래식)에는 영수증이 없어
                      // 잔액만 깎인 채 이유가 안 보인다. 상인이 먼저 정리하게 안내한다.
                      ? `⚠️ 아직 확인 대기 결제가 ${stats.pending_purchases}건 있어요!\n` +
                        '지금 닫으면 그 아이들의 달란트가 깎인 채 화면에서 사라집니다.\n' +
                        '상인 화면에서 남은 결제를 모두 확인/돌려주기 한 뒤 닫는 것을 권해요.\n\n그래도 닫을까요?'
                      : '기본 모드로 되돌릴까요?\n아이들 화면이 기부 화면으로 돌아갑니다.')
                  : '달란트 시장을 열까요?\n모든 아이 화면이 상점으로 바뀌고 기부가 멈춥니다.'
              )}
              className={`shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm text-white transition active:scale-95 disabled:opacity-50 ${
                isMarket ? 'bg-gray-600' : 'bg-orange-500'
              }`}
            >
              {busy === 'config' ? '바꾸는 중…' : isMarket ? '기본으로 되돌리기' : '🏪 달란트 시장 열기'}
            </button>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200/70 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700">말씀 암송 이벤트 담당</p>
              <p className="text-xs text-gray-500 mt-0.5">
                시장 모드에서 이 선생님만 반 상관없이 전체 학생에게 줄 수 있어요.
              </p>
            </div>
            <select
              value={stats?.event_host ?? ''}
              disabled={busy === 'config' || !stats}
              onChange={(e) => saveConfig({ event_host: e.target.value || null })}
              className="shrink-0 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm disabled:opacity-50"
            >
              <option value="">— 없음 —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.username}</option>
              ))}
            </select>
          </div>
        </section>

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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRole(t.id, 'student')}
                      disabled={busy === `role-${t.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                    >
                      학생으로 변경
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUser(t.id, t.username, 'teacher')}
                      disabled={busy === `del-${t.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
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
                    <button
                      type="button"
                      onClick={() => removeUser(s.id, s.username, 'student')}
                      disabled={busy === `del-${s.id}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 기부 명단 (관리자 전용 · 실명) */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-bold text-rose-600 border-b border-gray-100">
            기부 명단 ({donationList.length}건) · 관리자 전용
          </h2>
          <p className="px-5 pt-3 text-xs text-gray-400">
            공동체 화면에는 익명으로 보이지만, 여기서는 실제 이름·금액·시각을 볼 수 있어요.
          </p>
          {donationList.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">아직 기부 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50 mt-2">
              {donationList.map((d) => (
                <li key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-gray-800">{d.student_name}</span>
                    {d.message && (
                      <span className="ml-2 text-xs text-gray-400">“{d.message}”</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-rose-500">{d.amount} 달란트</p>
                    <p className="text-[11px] text-gray-400">{formatDateTime(d.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 데이터 초기화 */}
        <section className="bg-white rounded-2xl border border-red-100 shadow-sm px-5 py-4">
          <h2 className="font-bold text-red-600">데이터 초기화</h2>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            모든 달란트·기부 기록을 0으로 되돌려요. 계정은 그대로 유지됩니다.
          </p>
          <button
            type="button"
            onClick={resetData}
            disabled={busy === 'reset'}
            className="px-4 py-2 rounded-xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 active:scale-95 transition disabled:opacity-50"
          >
            {busy === 'reset' ? '초기화 중…' : '달란트·기부 초기화'}
          </button>
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
