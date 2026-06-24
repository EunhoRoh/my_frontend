import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { PERSONAL_STAGES } from '../constants/tree'
import { TREE_IMAGES } from '../constants/tree'
import AppHeader from '../components/AppHeader'
import Celebration from '../components/Celebration'

const QUICK_REASONS = ['예배에 집중했어요', '친구를 도왔어요', '말씀 암송', '봉사 참여', '기도 생활']

function TeacherPage() {
  const { data: students, refresh } = usePolling(() => apiFetch('/teacher/students/'), 8000)

  const [target, setTarget] = useState(null) // student being granted
  const [amount, setAmount] = useState(1)
  const [reason, setReason] = useState('')
  const [granting, setGranting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [celebrate, setCelebrate] = useState(false)

  const openGrant = (student) => {
    setTarget(student)
    setAmount(1)
    setReason('')
    setError('')
  }

  const handleGrant = async () => {
    setError('')
    setGranting(true)
    try {
      await apiFetch('/teacher/grant/', {
        method: 'POST',
        body: { student: target.id, amount, reason },
      })
      const name = target.username
      setTarget(null)
      await refresh()
      setToast(`${name} 학생에게 ${amount} 달란트를 주었어요!`)
      setCelebrate(true)
      setTimeout(() => setToast(null), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setGranting(false)
    }
  }

  const list = students ?? []

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-white to-emerald-50 px-4 py-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <AppHeader title="우리 반 달란트" />

        <p className="text-sm text-gray-500 px-1">
          담당 학생 <b className="text-sky-600">{list.length}</b>명 · 카드를 눌러 달란트를 주세요.
        </p>

        {list.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-sm text-gray-400">
            아직 배정된 학생이 없어요. 관리자에게 학생 배정을 요청하세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {list.map((s) => {
              const stage = Math.min(4, Math.max(0, s.stage))
              const info = PERSONAL_STAGES[stage]
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openGrant(s)}
                  className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-sky-200 active:scale-[0.99] transition px-4 py-3 text-left"
                >
                  <img
                    src={TREE_IMAGES[stage]}
                    alt=""
                    className="w-14 h-14 object-contain shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-800 truncate">{s.username}</p>
                    <p className="text-xs text-gray-400">{info.icon} {info.label}</p>
                    <div className="mt-1 flex gap-3 text-xs">
                      <span className="text-emerald-600 font-semibold">받음 {s.received_talent}</span>
                      <span className="text-rose-500 font-semibold">기부 {s.donated_talent}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sky-500 text-2xl font-light">＋</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 달란트 지급 모달 */}
      {target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !granting && setTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl px-6 py-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center font-bold text-gray-800 text-lg">
              {target.username} 에게 달란트 주기
            </h3>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAmount((a) => Math.max(1, a - 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
              >
                −
              </button>
              <span className="text-3xl font-extrabold text-sky-600 w-14 text-center">{amount}</span>
              <button
                type="button"
                onClick={() => setAmount((a) => Math.min(99, a + 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
              >
                ＋
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    reason === r
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-sky-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="칭찬 사유 (선택)"
              maxLength={200}
              className="mt-3 w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />

            {error && <p className="mt-2 text-sm text-red-500 text-center">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setTarget(null)}
                disabled={granting}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleGrant}
                disabled={granting || amount < 1}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-bold disabled:opacity-50"
              >
                {granting ? '주는 중…' : `${amount} 달란트 주기`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-full shadow-lg animate-badge-pop">
          🎉 {toast}
        </div>
      )}

      <Celebration
        show={celebrate}
        variant="receive"
        onDone={() => setCelebrate(false)}
        duration={1400}
      />
    </div>
  )
}

export default TeacherPage
