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

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout/', { method: 'POST' })
    } catch {
      /* ignore network errors on logout */
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
