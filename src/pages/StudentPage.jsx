import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { PERSONAL_STAGES, COMMUNITY_STAGES } from '../constants/tree'
import TreeCharacter from '../components/TreeCharacter'
import CommunityTree from '../components/CommunityTree'
import Celebration from '../components/Celebration'
import AppHeader from '../components/AppHeader'

const PERSONAL_GOAL = 40

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function StudentPage() {
  const dash = usePolling(() => apiFetch('/student/dashboard/'), 5000)
  const comm = usePolling(() => apiFetch('/community/'), 5000)

  const [donateOpen, setDonateOpen] = useState(false)
  const [amount, setAmount] = useState(1)
  const [message, setMessage] = useState('')
  const [donating, setDonating] = useState(false)
  const [donateError, setDonateError] = useState('')
  const [celebration, setCelebration] = useState(null)

  // Detect newly received talent across polls to trigger a celebration.
  const prevReceived = useRef(null)
  useEffect(() => {
    const received = dash.data?.received_talent
    if (received == null) return
    if (prevReceived.current != null && received > prevReceived.current) {
      setCelebration({
        variant: 'receive',
        title: `+${received - prevReceived.current} 달란트 받았어요!`,
        subtitle: '선생님이 칭찬을 보내주셨어요 💛',
      })
    }
    prevReceived.current = received
  }, [dash.data?.received_talent])

  const handleDonate = async () => {
    setDonateError('')
    setDonating(true)
    try {
      await apiFetch('/student/donate/', { method: 'POST', body: { amount, message } })
      setDonateOpen(false)
      setMessage('')
      setAmount(1)
      await Promise.all([dash.refresh(), comm.refresh()])
      setCelebration({
        variant: 'donate',
        title: `${amount} 달란트 기부 완료!`,
        subtitle: '우리 공동체 나무가 더 자랐어요 💝',
      })
    } catch (err) {
      setDonateError(err.message)
    } finally {
      setDonating(false)
    }
  }

  const d = dash.data
  const stage = d ? Math.min(4, Math.max(0, d.stage)) : 0
  const personalInfo = PERSONAL_STAGES[stage]
  const received = d?.received_talent ?? 0
  const balance = d?.balance ?? 0
  const progress = Math.min((received / PERSONAL_GOAL) * 100, 100)

  const c = comm.data
  const cStage = c ? Math.min(4, Math.max(0, c.stage)) : 0
  const communityInfo = COMMUNITY_STAGES[cStage]
  const cProgress = c ? Math.min((c.total_donated / c.goal) * 100, 100) : 0

  return (
    <div className="min-h-svh bg-gradient-to-b from-emerald-50 via-white to-amber-50 px-4 py-4">
      <div className="max-w-md mx-auto space-y-5">
        <AppHeader title="나의 성령 나무" />

        {/* 개인 나무 */}
        <section className="bg-white rounded-3xl shadow-xl shadow-emerald-100/60 border border-emerald-100 overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white text-center">
            <p className="text-emerald-50 text-sm font-medium">
              받은 달란트{' '}
              <span className="text-white font-bold text-base">
                {received} / {PERSONAL_GOAL}
              </span>
            </p>
            <div className="mt-3 h-2 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="px-6 py-7">
            <div className="border-2 border-dashed border-emerald-200 rounded-2xl bg-emerald-50/40 px-4 py-6 text-center">
              <div className="mb-4">
                <TreeCharacter stage={stage} size={260} />
              </div>
              <p className="text-emerald-800 font-bold text-lg">
                {personalInfo.icon} {personalInfo.label}
              </p>
              <p className="mt-2 text-emerald-600/80 text-sm font-medium">
                {personalInfo.description}
              </p>
              <p className="mt-3 text-emerald-600/70 text-sm">
                {received < PERSONAL_GOAL
                  ? `목표까지 ${PERSONAL_GOAL - received} 달란트 남았어요`
                  : '목표 달성! 나무에 열매가 열렸어요 🎉'}
              </p>
            </div>
          </div>
        </section>

        {/* 보유 & 기부 */}
        <section className="bg-white rounded-3xl shadow-md border border-gray-100 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">기부할 수 있는 달란트</p>
              <p className="text-2xl font-extrabold text-emerald-600">{balance} <span className="text-base font-semibold text-gray-400">달란트</span></p>
            </div>
            <button
              type="button"
              onClick={() => { setDonateOpen(true); setDonateError('') }}
              disabled={balance < 1}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-rose-400 to-amber-400 text-white font-bold shadow-md shadow-rose-200 hover:from-rose-500 hover:to-amber-500 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              💝 기부하기
            </button>
          </div>
          {balance < 1 && (
            <p className="mt-2 text-xs text-gray-400">선생님께 달란트를 받으면 공동체 나무에 기부할 수 있어요.</p>
          )}
        </section>

        {/* 공동체 나무 — 개인 나무와 다른 디자인 (밤하늘/금빛) */}
        <section className="rounded-3xl shadow-xl border border-indigo-900/30 overflow-hidden bg-gradient-to-b from-indigo-900 via-indigo-800 to-purple-900">
          <div className="px-6 py-5 text-center">
            <h2 className="text-amber-200 font-extrabold text-lg">🌳 우리 공동체 나무</h2>
            <p className="mt-1 text-indigo-100/80 text-xs">
              친구들이 기부한 달란트{' '}
              <span className="text-amber-200 font-bold">
                {c?.total_donated ?? 0} / {c?.goal ?? 100}
              </span>
              {c?.donor_count != null && <> · {c.donor_count}명 참여</>}
            </p>
            <div className="mt-3 h-2 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-300 to-yellow-200 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${cProgress}%` }}
              />
            </div>
          </div>
          <div className="px-6 pb-6">
            <div className="py-4">
              <CommunityTree stage={cStage} size={200} />
            </div>
            <p className="text-center text-amber-100 font-bold">
              {communityInfo.icon} {communityInfo.label}
            </p>
            <p className="mt-1 text-center text-indigo-100/70 text-sm">
              {communityInfo.description}
            </p>

            {c?.recent_donations?.length > 0 && (
              <ul className="mt-4 space-y-1.5 max-h-40 overflow-y-auto">
                {c.recent_donations.map((don) => (
                  <li key={don.id} className="flex items-center justify-between text-xs text-indigo-100/90 bg-white/5 rounded-lg px-3 py-2">
                    <span className="font-semibold">💫 {don.student_name}</span>
                    <span className="text-amber-200">{don.amount} 달란트 기부</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 받은 달란트 타임라인 */}
        <section className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
          <h2 className="px-5 py-4 font-bold text-gray-700 border-b border-gray-100">
            받은 달란트 이야기
          </h2>
          {d?.grants?.length ? (
            <ul className="divide-y divide-gray-50">
              {d.grants.map((g) => (
                <li key={g.id} className="px-5 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">
                      🧑‍🏫 {g.teacher_name} 선생님
                    </span>
                    <span className="text-sm font-bold text-emerald-600">+{g.amount}</span>
                  </div>
                  {g.reason && <p className="mt-0.5 text-sm text-gray-500">“{g.reason}”</p>}
                  <p className="mt-0.5 text-xs text-gray-300">{formatDate(g.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-gray-400 text-center">
              아직 받은 달란트가 없어요. 곧 선생님이 보내주실 거예요!
            </p>
          )}
        </section>
      </div>

      {/* 기부 모달 */}
      {donateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => !donating && setDonateOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl px-6 py-6 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center text-3xl mb-2">💝</p>
            <h3 className="text-center font-bold text-gray-800">공동체 나무에 기부하기</h3>
            <p className="mt-1 text-center text-sm text-gray-500">
              보유 {balance} 달란트 중 나눠요
            </p>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAmount((a) => Math.max(1, a - 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
              >
                −
              </button>
              <span className="text-2xl font-extrabold text-emerald-600 w-12 text-center">{amount}</span>
              <button
                type="button"
                onClick={() => setAmount((a) => Math.min(balance, a + 1))}
                className="w-10 h-10 rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
              >
                +
              </button>
            </div>

            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="응원 메시지 (선택)"
              maxLength={200}
              className="mt-4 w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            {donateError && <p className="mt-2 text-sm text-red-500 text-center">{donateError}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDonateOpen(false)}
                disabled={donating}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDonate}
                disabled={donating || amount < 1 || amount > balance}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-400 to-amber-400 text-white font-bold disabled:opacity-50"
              >
                {donating ? '기부 중…' : '기부하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Celebration
        show={!!celebration}
        variant={celebration?.variant}
        title={celebration?.title}
        subtitle={celebration?.subtitle}
        onDone={() => setCelebration(null)}
      />
    </div>
  )
}

export default StudentPage
