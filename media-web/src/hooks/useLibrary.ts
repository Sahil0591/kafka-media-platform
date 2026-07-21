import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useStream } from '@/stream/StreamProvider'
import type { MediaSummary } from '@/lib/types'

export interface LiveMedia extends MediaSummary {
  /** 0-100 for in-flight work, null when there is nothing to show. */
  progress: number | null
  stage: string | null
  detail: string | null
}

/**
 * The library list, reconciled against the live event stream.
 *
 * The REST call establishes the baseline; SSE events then overlay newer status
 * on top. A terminal event also schedules one refetch so fields the event does
 * not carry - renditions, timestamps - catch up without polling.
 */
export function useLibrary() {
  const [items, setItems] = useState<MediaSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { latestByMedia } = useStream()

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await api.media.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your library')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Terminal events change more than status alone, so settle with one refetch.
  const terminalSignature = useMemo(
    () =>
      [...latestByMedia.values()]
        .filter((event) => event.type === 'processed' || event.type === 'failed')
        .map((event) => `${event.mediaId}:${event.type}`)
        .join('|'),
    [latestByMedia],
  )

  useEffect(() => {
    if (!terminalSignature) return
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => void load(), 700)
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current)
    }
  }, [terminalSignature, load])

  const live = useMemo<LiveMedia[]>(
    () =>
      items.map((item) => {
        const event = latestByMedia.get(item.id)
        if (!event) return { ...item, progress: null, stage: null, detail: null }
        return {
          ...item,
          // A stale REST status must never override a newer event.
          status: event.status ?? item.status,
          progress: event.progress,
          stage: event.stage,
          detail: event.message,
        }
      }),
    [items, latestByMedia],
  )

  return { items: live, loading, error, reload: load }
}
