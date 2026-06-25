import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { COMMUNITY_STAGES } from '../constants/tree'
import CommunityTree from '../components/CommunityTree'
import Celebration from '../components/Celebration'

/**
 * Event-day big screen — community tree only, no login or header.
 * Open `?display` on a projector/TV; it polls the public summary endpoint.
 */
function CommunityDisplayPage() {
  const { data, error } = usePolling(
    () => apiFetch('/community/display/', { auth: false }),
    4000,
  )

  const stage = data ? Math.min(4, Math.max(0, data.stage)) : 0
  const info = COMMUNITY_STAGES[stage]
  const total = data?.total_donated ?? 0
  const goal = data?.goal ?? 100
  const donors = data?.donor_count ?? 0
  const progress = Math.min((total / goal) * 100, 100)

  // 화면에 떠 있는 동안 단계가 오르면 큰 축하 (첫 로딩은 기준선만).
  const [celebrate, setCelebrate] = useState(false)
  const prevStage = useRef(null)
  useEffect(() => {
    if (data == null) return
    if (prevStage.current != null && stage > prevStage.current) {
      setCelebrate(true)
    }
    prevStage.current = stage
  }, [stage, data])

  return (
    <div className="min-h-svh bg-gradient-to-b from-sky-50 via-emerald-50 to-amber-50 text-gray-800 flex flex-col items-center justify-center px-6 py-10 overflow-hidden">
      <h1 className="text-emerald-700 font-extrabold tracking-tight text-3xl sm:text-5xl text-center">
        🌳 우리 공동체 나무
      </h1>
      <p className="mt-2 text-emerald-600/70 text-sm sm:text-xl text-center">
        함께 나눈 사랑이 나무를 키워요
      </p>

      {/* 나무를 가장 크게 — 성장이 잘 보이도록 */}
      <div className="my-6 sm:my-8 w-full max-w-3xl flex justify-center">
        <CommunityTree stage={stage} size={440} />
      </div>

      <p className="text-amber-600 font-extrabold text-2xl sm:text-4xl text-center">
        {info.icon} {info.label}
      </p>
      <p className="mt-1 text-emerald-700/70 text-base sm:text-2xl text-center">
        {info.description}
      </p>

      {/* 큰 숫자 */}
      <div className="mt-6 text-center">
        <p className="text-emerald-600 font-black leading-none text-6xl sm:text-8xl tabular-nums">
          {total}
        </p>
        <p className="mt-2 text-gray-500 text-lg sm:text-2xl">
          / {goal} 달란트 · {donors}명의 마음이 모였어요
        </p>
      </div>

      {/* 진행바 */}
      <div className="mt-5 w-full max-w-2xl">
        <div className="h-5 sm:h-6 bg-white rounded-full overflow-hidden shadow-inner border border-emerald-100">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-amber-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="mt-6 text-sm text-amber-600">
          ⚠️ 연결을 다시 시도하고 있어요…
        </p>
      )}

      <Celebration
        show={celebrate}
        variant="levelup"
        title="공동체 나무가 자랐어요!"
        subtitle={`${info.icon} ${info.label}`}
        onDone={() => setCelebrate(false)}
        duration={3200}
      />
    </div>
  )
}

export default CommunityDisplayPage
