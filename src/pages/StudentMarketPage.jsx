import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import { COMMUNITY_STAGES, COMMUNITY_GOAL_FALLBACK } from '../constants/tree'
import CommunityTree from '../components/CommunityTree'
import Celebration from '../components/Celebration'
import AppHeader from '../components/AppHeader'

const MAX_PAY = 100 // 서버(MAX_PURCHASE)와 같은 값 — 화면에서 먼저 걸러 준다
const QUICK = [1, 2, 3, 5, 10]

// 진동은 분위기를 살리는 보조 수단일 뿐이다. iOS 사파리는 지원하지 않으므로
// 진동이 없어도 애니메이션·소리만으로 충분히 전달되도록 만들었다.
function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* 지원하지 않는 브라우저 */
  }
}

/** 결제 순간 화면을 가로질러 떨어지는 동전들. */
function CoinRain({ show }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="absolute -top-10 animate-coin-drop select-none"
          style={{
            left: `${(i * 41) % 96}%`,
            fontSize: 22 + (i % 4) * 8,
            animationDelay: `${(i % 6) * 0.09}s`,
          }}
        >
          {i % 3 === 0 ? '💰' : '🪙'}
        </span>
      ))}
    </div>
  )
}

/** 톱니 가장자리가 있는 종이 영수증. 확인되면 도장이 찍힌다. */
function Receipt({ purchase, stamped, onCancel, cancelling }) {
  return (
    <div className="relative animate-receipt-in">
      {/* 위·아래 톱니 — 종이에서 뜯어낸 느낌 */}
      <div
        className="h-3 bg-white"
        style={{
          maskImage: 'radial-gradient(circle at 6px 0, transparent 5px, black 5px)',
          maskSize: '12px 12px',
          WebkitMaskImage: 'radial-gradient(circle at 6px 0, transparent 5px, black 5px)',
          WebkitMaskSize: '12px 12px',
        }}
      />
      <div className="bg-white px-6 pb-6 pt-2 text-center shadow-lg shadow-amber-900/10">
        <p className="text-xs font-bold tracking-[0.3em] text-amber-700">달란트 상점</p>
        <div className="mx-auto my-3 h-px w-full border-t-2 border-dashed border-gray-200" />

        <p className="text-xs text-gray-400">확인 번호</p>
        <p
          className={`font-mono text-5xl font-extrabold tracking-[0.15em] text-gray-800 ${
            stamped ? '' : 'animate-code-pulse'
          }`}
        >
          {purchase.code}
        </p>

        <p className="mt-4 text-3xl font-extrabold text-rose-500">{purchase.amount} 달란트</p>

        <div className="mx-auto my-4 h-px w-full border-t-2 border-dashed border-gray-200" />

        {stamped ? (
          <p className="text-sm font-bold text-emerald-600">
            받았어요! {purchase.merchant_name ? `(${purchase.merchant_name})` : ''}
          </p>
        ) : (
          <p className="text-sm font-medium text-gray-500">
            상인 선생님께 이 번호를 보여주세요 🙌
          </p>
        )}

        {/* 도장 — 상인이 확인하는 순간 비스듬히 내리꽂힌다 */}
        {stamped && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="animate-stamp-slam grid h-32 w-32 place-items-center rounded-full border-[6px] border-rose-500/80 text-center">
              <span className="text-2xl font-black leading-tight text-rose-500/90">
                확인
                <br />
                완료
              </span>
            </div>
          </div>
        )}
      </div>
      <div
        className="h-3 bg-white"
        style={{
          maskImage: 'radial-gradient(circle at 6px 12px, transparent 5px, black 5px)',
          maskSize: '12px 12px',
          WebkitMaskImage: 'radial-gradient(circle at 6px 12px, transparent 5px, black 5px)',
          WebkitMaskSize: '12px 12px',
        }}
      />

      {!stamped && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="mt-4 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-500 transition active:scale-95 disabled:opacity-50"
        >
          {cancelling ? '무르는 중…' : '잘못 냈어요 · 무르기'}
        </button>
      )}
    </div>
  )
}

function StudentMarketPage({ dash }) {
  const [tab, setTab] = useState('shop') // 'shop' | 'tree'
  const [amount, setAmount] = useState(1)
  const [paying, setPaying] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState('')
  const [coins, setCoins] = useState(false)
  const [celebration, setCelebration] = useState(null)
  // 도장이 찍힌 영수증을 잠깐 더 보여준다(바로 사라지면 뭘 봤는지 모른다).
  const [stamped, setStamped] = useState(null)

  // 기부는 멈췄으므로 나무 값은 더 변하지 않는다. 탭을 열 때 한 번만 받고
  // 주기 호출은 하지 않는다 — 아이 한 명당 분당 4회의 요청이 통째로 사라진다.
  const comm = usePolling(() => apiFetch('/community/'), 600000, [tab], {
    enabled: tab === 'tree',
  })

  const d = dash.data
  const balance = d?.balance ?? 0
  const purchases = useMemo(() => d?.purchases ?? [], [d?.purchases])
  const pending = purchases.find((p) => p.status === 'pending')
  const max = Math.min(balance, MAX_PAY)

  // 상인이 확인해 주기를 기다리는 결제를 추적한다. 대기가 사라진 순간
  // 그 건이 '확인 완료'가 되었으면 도장을 찍는다(취소됐으면 조용히 지나간다).
  const watching = useRef(null)
  useEffect(() => {
    const stillPending = purchases.find((p) => p.status === 'pending')
    if (stillPending) {
      watching.current = stillPending.id
      return
    }
    if (watching.current == null) return
    const settled = purchases.find((p) => p.id === watching.current)
    watching.current = null
    if (settled?.status === 'done') {
      setStamped(settled)
      buzz([40, 60, 140])
      setCelebration({
        variant: 'purchase',
        title: '물건 받았어요!',
        subtitle: `${settled.amount} 달란트를 냈어요 🎁`,
      })
    }
  }, [purchases])

  // 도장 영수증은 4초 뒤 사라지고 다시 결제 화면으로 돌아온다.
  useEffect(() => {
    if (!stamped) return
    const id = setTimeout(() => setStamped(null), 4000)
    return () => clearTimeout(id)
  }, [stamped])

  // 말씀 암송 보너스 등 새로 받은 달란트를 감지해 축하한다.
  const prevReceived = useRef(null)
  useEffect(() => {
    const received = d?.received_talent
    if (received == null) return
    if (prevReceived.current != null && received > prevReceived.current) {
      buzz(60)
      setCelebration({
        variant: 'receive',
        title: `+${received - prevReceived.current} 달란트!`,
        subtitle: '선생님이 달란트를 주셨어요 💛',
      })
    }
    prevReceived.current = received
  }, [d?.received_talent])

  // 잔액이 줄어도(결제 직후) 입력값이 잔액을 넘지 않도록 렌더에서 바로 좁힌다.
  // effect + setState 로 맞추면 잘못된 값이 한 번 그려진 뒤 고쳐져 화면이 튄다.
  const payAmount = Math.min(Math.max(1, amount), Math.max(1, max))

  const pay = async () => {
    setError('')
    setPaying(true)
    try {
      await apiFetch('/student/purchase/', { method: 'POST', body: { amount: payAmount } })
      setCoins(true)
      buzz([30, 40, 30])
      setTimeout(() => setCoins(false), 1200)
      await dash.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setPaying(false)
    }
  }

  const cancel = async () => {
    if (!pending) return
    setError('')
    setCancelling(true)
    try {
      await apiFetch(`/student/purchase/${pending.id}/cancel/`, { method: 'POST' })
      await dash.refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setCancelling(false)
    }
  }

  const c = comm.data
  const cStage = c ? Math.min(COMMUNITY_STAGES.length - 1, Math.max(0, c.stage)) : 0
  const cGoal = c?.goal ?? COMMUNITY_GOAL_FALLBACK
  const cProgress = c ? Math.min((c.total_donated / cGoal) * 100, 100) : 0

  const showReceipt = pending || stamped

  return (
    <div className="min-h-svh bg-gradient-to-b from-amber-50 to-orange-50 pb-24">
      <CoinRain show={coins} />
      <Celebration
        show={!!celebration}
        variant={celebration?.variant}
        title={celebration?.title}
        subtitle={celebration?.subtitle}
        onDone={() => setCelebration(null)}
      />

      <div className="mx-auto max-w-md px-4 pt-4">
        <AppHeader title="달란트 상점" />

        {/* 보유 달란트 */}
        <div className="mt-2 rounded-3xl bg-white px-5 py-5 text-center shadow-sm">
          <p className="text-xs font-medium text-gray-400">내 달란트</p>
          <p className="mt-1 text-6xl font-extrabold text-amber-500 tabular-nums">{balance}</p>
        </div>

        {tab === 'shop' ? (
          <div className="mt-4">
            {showReceipt ? (
              <Receipt
                purchase={stamped ?? pending}
                stamped={!!stamped}
                onCancel={cancel}
                cancelling={cancelling}
              />
            ) : balance < 1 ? (
              <div className="rounded-3xl bg-white px-6 py-10 text-center shadow-sm">
                <p className="text-4xl">🐷</p>
                <p className="mt-3 font-bold text-gray-700">달란트를 다 썼어요</p>
                <p className="mt-1 text-sm text-gray-400">
                  말씀을 암송하면 달란트를 더 받을 수 있어요!
                </p>
              </div>
            ) : (
              <div className="rounded-3xl bg-white px-5 py-6 shadow-sm">
                <p className="text-center text-sm font-semibold text-gray-500">
                  얼마를 낼까요?
                </p>

                <div className="mt-4 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setAmount(Math.max(1, payAmount - 1))}
                    className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-3xl font-bold text-gray-600 transition active:scale-90"
                    aria-label="1 줄이기"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={payAmount}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10)
                      setAmount(Number.isNaN(n) ? 1 : Math.min(Math.max(1, n), max))
                    }}
                    className="w-28 bg-transparent text-center text-5xl font-extrabold tabular-nums text-gray-800 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setAmount(Math.min(max, payAmount + 1))}
                    className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-3xl font-bold text-gray-600 transition active:scale-90"
                    aria-label="1 늘리기"
                  >
                    +
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {QUICK.filter((n) => n <= max).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAmount(n)}
                      className={`rounded-full border px-4 py-1.5 text-sm font-bold transition active:scale-95 ${
                        payAmount === n
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : 'border-gray-200 bg-white text-gray-500'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {error && (
                  <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2.5 text-center text-sm font-medium text-rose-600">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={pay}
                  disabled={paying || payAmount < 1 || payAmount > max}
                  className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 py-4 text-lg font-extrabold text-white shadow-lg shadow-orange-300/40 transition active:scale-95 disabled:opacity-50"
                >
                  {paying ? '내는 중…' : `💰 ${payAmount} 달란트 내기`}
                </button>
              </div>
            )}

            {error && showReceipt && (
              <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-center text-sm font-medium text-rose-600">
                {error}
              </p>
            )}
          </div>
        ) : (
          /* 기부 나무 — 보기 전용 */
          <div className="mt-4 rounded-3xl bg-white px-5 py-6 text-center shadow-sm">
            {comm.loading && !c ? (
              <p className="py-10 text-sm text-gray-400">나무를 불러오는 중…</p>
            ) : (
              <>
                <CommunityTree stage={cStage} size={260} />
                <p className="mt-4 text-2xl font-extrabold text-emerald-600">
                  {c?.total_donated ?? 0}
                  <span className="text-sm font-medium text-gray-400"> / {cGoal} 달란트</span>
                </p>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-300 transition-all"
                    style={{ width: `${cProgress}%` }}
                  />
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  친구들 <b className="text-emerald-600">{c?.donor_count ?? 0}명</b>이 모아 준
                  나무예요
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  오늘은 달란트 상점의 날이라 기부는 쉬어요 🌙
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* 하단 탭바 */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {[
            { key: 'shop', icon: '🏪', label: '상점' },
            { key: 'tree', icon: '🌳', label: '기부 나무' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-center transition ${
                tab === t.key ? 'text-amber-600' : 'text-gray-400'
              }`}
            >
              <span className="block text-xl">{t.icon}</span>
              <span className="mt-0.5 block text-xs font-bold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default StudentMarketPage
