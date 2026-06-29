import { useEffect, useState, useCallback } from 'react'
import { apiFetch, setToken, getToken } from '../api/client'
import { AuthContext } from './context'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // Start in "loading" only if there is a token to validate.
  const [loading, setLoading] = useState(() => !!getToken())

  // Restore session from a stored token on first load.
  useEffect(() => {
    if (!getToken()) return
    apiFetch('/me/')
      .then(setUser)
      .catch(() => {
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await apiFetch('/auth/login/', {
      method: 'POST',
      auth: false,
      body: { username, password },
    })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (username, password) => {
    const data = await apiFetch('/auth/register/', {
      method: 'POST',
      auth: false,
      body: { username, password },
    })
    setToken(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    // 서버 응답을 기다리지 않고 즉시 로그아웃 (서버 토큰 삭제는 백그라운드로).
    // apiFetch가 헤더에 현재 토큰을 동기적으로 담은 뒤 요청을 보내므로,
    // 바로 아래에서 토큰을 지워도 이 요청에는 토큰이 실린다.
    if (getToken()) {
      apiFetch('/auth/logout/', { method: 'POST' }).catch(() => {})
    }
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}
