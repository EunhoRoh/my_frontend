import { useState } from 'react'
import { apiFetch } from '../api/client'
import { usePolling } from '../hooks/usePolling'
import AppHeader from '../components/AppHeader'

// 상인은 아이가 눈앞에 서 있는 채로 확인을 누른다. 대기 목록이 늦게 뜨면
// 줄이 막히므로 학생 화면(5초)보다 짧게 잡는다. 상인은 많아야 네 명이라
// 이 주기로도 서버 부담은 분당 80회 수준이다.
const POLL_MS = 3000

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Stat({ label, value, accent }) {
  return (
    <div className="flex-1 rounded-2xl bg-white px-3 py-3 text-center shadow-sm">
      <p className={`text-2xl font-extrabold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{label}</p>
    </div>
  )
}

function MerchantPage() {
  const list = usePolling(() => apiFetch('/merchant/purchases/'), POLL_MS)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const pending = list.data?.pending ?? []
  const settled = list.data?.settled ?? []

  const act = async (purchase, action) => {
    if (action === 'refund') {
      const ok = window.confirm(
        `${purchase.student_name} 학생의 ${purchase.amount} 달란트를 돌려줄까요?\n` +
          '물건을 받아가지 않았는지 꼭 확인해 주세요.',
      )
      if (!ok) return
    }
    setBusy(purchase.id)
    setError('')
    try {
      await apiFetch(`/merchant/purchases/${purchase.id}/`, {
        method: 'POST',
        body: { action },
      })
      await list.refresh()
    } catch (err) {
      // 다른 상인이 먼저 처리한 경우가 대부분이라, 목록을 새로 받아 화면을 맞춘다.
      setError(err.message)
      list.refresh().catch(() => {})
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-svh bg-gray-50 px-4 py-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <AppHeader title="달란트 상점 · 계산대" />

        <div className="flex gap-3">
          <Stat label="확인 대기" value={pending.length} accent="text-rose-500" />
          <Stat label="오늘 받은 달란트" value={list.data?.today_total ?? '–'} accent="text-amber-500" />
          <Stat label="오늘 판매" value={list.data?.today_count ?? '–'} accent="text-emerald-600" />
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}

        {/* 확인 대기 — 먼저 낸 아이가 위로 온다 */}
        <section>
          <h2 className="px-1 pb-2 text-sm font-bold text-gray-700">
            확인 대기 ({pending.length}명)
          </h2>

          {pending.length === 0 ? (
            <div className="rounded-2xl bg-white px-5 py-10 text-center shadow-sm">
              <p className="text-3xl">☕</p>
              <p className="mt-2 text-sm text-gray-400">기다리는 아이가 없어요</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {pending.map((p) => (
                <li
                  key={p.id}
                  className="rounded-2xl border-2 border-amber-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-gray-900 font-mono text-2xl font-extrabold tracking-wider text-white">
                      {p.code}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-extrabold text-gray-800">
                        {p.student_name}
                      </p>
                      <p className="text-sm text-gray-400">{formatTime(p.created_at)}</p>
                    </div>
                    <p className="shrink-0 text-3xl font-extrabold text-rose-500 tabular-nums">
                      {p.amount}
                    </p>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => act(p, 'confirm')}
                      disabled={busy === p.id}
                      className="flex-[2] rounded-xl bg-emerald-500 py-3.5 text-base font-extrabold text-white transition active:scale-95 disabled:opacity-50"
                    >
                      {busy === p.id ? '처리 중…' : '✅ 물건 줬어요'}
                    </button>
                    <button
                      type="button"
                      onClick={() => act(p, 'refund')}
                      disabled={busy === p.id}
                      className="flex-1 rounded-xl border border-gray-200 bg-white py-3.5 text-sm font-semibold text-gray-500 transition active:scale-95 disabled:opacity-50"
                    >
                      돌려주기
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 오늘 처리한 내역 — 잘못 확인했을 때 여기서 되돌린다 */}
        <section>
          <h2 className="px-1 pb-2 text-sm font-bold text-gray-700">오늘 처리한 내역</h2>
          {settled.length === 0 ? (
            <p className="rounded-2xl bg-white px-5 py-6 text-center text-sm text-gray-400 shadow-sm">
              아직 없어요
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white shadow-sm">
              {settled.map((p) => {
                const refunded = p.status === 'refunded'
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        refunded
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {refunded ? '취소' : '판매'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700">
                      {p.student_name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-gray-400">{p.code}</span>
                    <span
                      className={`shrink-0 text-sm font-extrabold tabular-nums ${
                        refunded ? 'text-gray-400 line-through' : 'text-amber-600'
                      }`}
                    >
                      {p.amount}
                    </span>
                    {!refunded && (
                      <button
                        type="button"
                        onClick={() => act(p, 'refund')}
                        disabled={busy === p.id}
                        className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 transition active:scale-95 disabled:opacity-50"
                      >
                        되돌리기
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default MerchantPage
