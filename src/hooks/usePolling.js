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
    const tick = () => {
      if (active) refresh().catch(() => {})
    }
    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      active = false
      clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, refresh, setData }
}
