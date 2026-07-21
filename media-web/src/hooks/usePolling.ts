import { useCallback, useEffect, useRef, useState } from 'react'

export interface Polled<T> {
  data: T | null
  /** True only before the first successful response - refreshes never re-enter it. */
  loading: boolean
  error: string | null
  /** True while a background refresh is in flight, so the view can dim rather than flash. */
  refreshing: boolean
}

/**
 * Polls an endpoint on an interval, holding the last good value.
 *
 * A refetch never clears `data`, so the dashboard dims the existing render
 * instead of collapsing to skeletons and jumping the layout. Polling pauses
 * while the tab is hidden - there is nobody to show it to, and the AdminClient
 * calls behind these endpoints are not free.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): Polled<T> & {
  refresh: () => void
} {
  const [state, setState] = useState<Polled<T>>({
    data: null,
    loading: true,
    error: null,
    refreshing: false,
  })

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mounted = useRef(true)

  const run = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true }))
    try {
      const next = await fetcherRef.current()
      if (mounted.current) setState({ data: next, loading: false, error: null, refreshing: false })
    } catch (e) {
      if (mounted.current) {
        setState((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: e instanceof Error ? e.message : 'Request failed',
        }))
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void run()

    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(() => void run(), intervalMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else {
        void run()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      mounted.current = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [run, intervalMs])

  return { ...state, refresh: () => void run() }
}
