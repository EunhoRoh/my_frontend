import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Periodically fetches data via `fetcher` and returns { data, error, loading, refresh }.
 * Polling keeps the shared/community state fresh without WebSockets.
 */
export function usePolling(fetcher, intervalMs = 5000, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const savedFetcher = useRef(fetcher)

  // Keep the latest fetcher without re-subscribing the interval.
  useEffect(() => {
    savedFetcher.current = fetcher
  })

  const refresh = useCallback(async () => {
    try {
      const result = await savedFetcher.current()
      setData(result)
      setError(null)
      return result
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    // 백그라운드 탭(화면 잠금·앱 전환)에서는 폴링을 멈춰 서버 부하를 줄인다.
    const tick = () => {
      if (active && !document.hidden) refresh().catch(() => {})
    }
    tick()
    const id = setInterval(tick, intervalMs)
    // 다시 화면이 보이면 즉시 한 번 갱신
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, refresh, setData }
}
