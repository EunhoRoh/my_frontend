import { useState } from 'react'
import { useAuth } from '../auth/useAuth'

function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isRegister = mode === 'register'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (isRegister) {
        await register(username.trim(), password)
      } else {
        await login(username.trim(), password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-gradient-to-b from-emerald-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl shadow-emerald-100/60 border border-emerald-100 overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-8 text-white text-center">
          <h1 className="text-xl font-extrabold leading-snug">🌱 성령의 나무</h1>
          <p className="mt-2 text-emerald-50 text-sm">함께 키우는 우리들의 사랑 나무</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-7 space-y-4">
          <div className="flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => { setMode('login'); setError('') }}
              className={`flex-1 py-2 rounded-lg transition ${
                !isRegister ? 'bg-white text-emerald-600 shadow' : 'text-gray-500'
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError('') }}
              className={`flex-1 py-2 rounded-lg transition ${
                isRegister ? 'bg-white text-emerald-600 shadow' : 'text-gray-500'
              }`}
            >
              회원가입
            </button>
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-600 mb-1">
              이름
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="이름을 입력하세요"
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-1">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
            />
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '잠시만요…' : isRegister ? '가입하고 시작하기' : '들어가기'}
          </button>

          {isRegister && (
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              가입하면 <b>학생</b>으로 시작해요.<br />
              선생님·관리자 권한은 관리자가 지정해 드려요.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}

export default LoginPage
