import { useEffect, useState } from 'react'
import { loadCodeState, resetCodeState } from './utils/codeStorage'

const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN ?? '1234'

function formatDate(iso) {
  return new Date(iso).toLocaleString('ko-KR')
}

function Admin() {
  const [pin, setPin] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [codeState, setCodeState] = useState(null)
  const [error, setError] = useState('')

  const refresh = async () => {
    const state = await loadCodeState()
    setCodeState(state)
  }

  useEffect(() => {
    if (authenticated) {
      refresh().catch(() => setError('코드 목록을 불러오지 못했습니다.'))
    }
  }, [authenticated])

  const handleLogin = (e) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) {
      setAuthenticated(true)
      setError('')
      return
    }
    setError('관리자 비밀번호가 올바르지 않습니다.')
  }

  const handleReset = async () => {
    if (!window.confirm('사용 기록을 모두 지우고 codes.json 기준으로 초기화할까요?')) {
      return
    }

    try {
      const state = await resetCodeState()
      setCodeState(state)
    } catch {
      setError('초기화에 실패했습니다.')
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-svh bg-gray-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4"
        >
          <h1 className="text-lg font-bold text-gray-800 text-center">관리자 로그인</h1>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="관리자 비밀번호"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition"
          >
            들어가기
          </button>
          <a href="/" className="block text-center text-sm text-gray-500 hover:text-emerald-600">
            ← 학생 화면으로
          </a>
        </form>
      </div>
    )
  }

  const availableEntries = Object.entries(codeState?.available ?? {})
  const usedEntries = Object.entries(codeState?.used ?? {})

  return (
    <div className="min-h-svh bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-800">기부 코드 관리</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium hover:bg-gray-50"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600"
            >
              전체 초기화
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600"
            >
              학생 화면
            </a>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          남은 코드는 <code className="bg-gray-100 px-1 rounded">public/codes.json</code>에서 추가·수정할 수 있습니다.
          사용된 코드는 이 브라우저의 localStorage에 저장됩니다.
        </p>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-semibold text-emerald-700 border-b border-gray-100">
            남은 코드 ({availableEntries.length}개)
          </h2>
          {availableEntries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">남은 코드가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {availableEntries.map(([code, amount]) => (
                <li key={code} className="px-5 py-3 flex justify-between text-sm">
                  <span className="font-medium text-gray-800">{code}</span>
                  <span className="text-emerald-600">{amount} TALENT</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <h2 className="px-5 py-4 font-semibold text-gray-600 border-b border-gray-100">
            사용된 코드 ({usedEntries.length}개)
          </h2>
          {usedEntries.length === 0 ? (
            <p className="px-5 py-6 text-sm text-gray-400">아직 사용된 코드가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {usedEntries.map(([code, info]) => (
                <li key={code} className="px-5 py-3 flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-500 line-through">{code}</span>
                  <span className="text-gray-400">
                    {info.amount} TALENT · {formatDate(info.usedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default Admin
