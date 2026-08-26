import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import AppHeader from '../components/AppHeader'

// 아이가 눈앞에 서 있는 채로 누르는 화면이라 반응이 빨라야 한다. 진행자는 한 명뿐이라
// 이 주기의 서버 부담은 분당 12회 수준이다.
const POLL_MS = 5000

/** 남은 도전 기회를 ●●○ 로 보여준다. */
function Dots({ used, max }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${max}번 중 ${used}번 사용`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${i < used ? 'bg-violet-500' : 'bg-gray-200'}`}
        />
      ))}
    </span>
  )
}

function EventPage() {
  const list = usePolling(() => apiFetch('/event/students/'), POLL_MS)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState(null) // 방금 지급한 학생 id — 잠깐 강조

  const students = list.data?.students ?? []
  const max = list.data?.max_per_student ?? 3

  const give = async (student, undo = false) => {
    setBusy(student.id)
    setError('')
    try {
      await apiFetch('/event/grant/', {
        method: 'POST',
        body: { student: student.id, undo },
      })
      if (!undo) {
        setFlash(student.id)
        setTimeout(() => setFlash(null), 900)
      }
      await list.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-svh bg-gray-50 px-4 py-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <AppHeader title="말씀 암송 이벤트" />

        <div className="rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-4 text-white shadow-sm">
          <p className="text-lg font-extrabold">📖 말씀을 암송하면 1달란트!</p>
          <p className="mt-1 text-sm text-white/80">
            한 사람당 {max}개까지 도전할 수 있어요 · 오늘 총{' '}
            <b>{list.data?.today_given ?? 0}개</b> 지급
          </p>
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}

        {list.loading && students.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : (
          <ul className="space-y-2.5">
            {students.map((s) => {
              const done = s.remaining <= 0
              return (
                <li
                  key={s.id}
                  className={`rounded-2xl bg-white p-4 shadow-sm transition ${
                    flash === s.id ? 'ring-2 ring-violet-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-extrabold text-gray-800">
                        {s.username}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Dots used={s.verse_count} max={max} />
                        <span className="text-xs text-gray-400">
                          {done ? '다 받았어요' : `${s.remaining}번 남음`}
                        </span>
                      </div>
                    </div>

                    {/* 지금 가진 달란트 — '1개만 더 있으면 살 수 있어요' 판단용 */}
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-extrabold tabular-nums text-amber-500">
                        {s.balance}
                      </p>
                      <p className="text-[11px] text-gray-400">보유</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => give(s)}
                      disabled={done || busy === s.id}
                      className="shrink-0 rounded-xl bg-violet-500 px-4 py-3 text-sm font-extrabold text-white transition active:scale-95 disabled:bg-gray-200 disabled:text-gray-400"
                    >
                      {busy === s.id ? '…' : '+1'}
                    </button>
                  </div>

                  {s.verse_count > 0 && (
                    <button
                      type="button"
                      onClick={() => give(s, true)}
                      disabled={busy === s.id}
                      className="mt-2 w-full rounded-lg border border-gray-200 py-2 text-xs font-semibold text-gray-500 transition active:scale-95 disabled:opacity-50"
                    >
                      잘못 눌렀어요 · 되돌리기
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default EventPage
