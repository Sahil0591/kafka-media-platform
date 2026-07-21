import { useEffect, useState } from 'react'
import { api, streamUrl } from '@/lib/api'
import type { StreamEvent } from '@/lib/types'

const CAPACITY = 80

/**
 * Anonymized cluster-wide event flow for the ops view.
 *
 * Seeded from the API's replay buffer so a freshly opened dashboard is not
 * blank until the next event fires. Separate from the owner-scoped session
 * stream: this one is scoped to the page and closes when it unmounts.
 */
export function useFirehose() {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false

    api.ops
      .recentEvents()
      .then((recent) => {
        if (cancelled) return
        // The API returns oldest-first; the feed reads newest-first.
        setEvents((current) => (current.length ? current : [...recent].reverse().slice(0, CAPACITY)))
      })
      .catch(() => {
        // A missing replay buffer is not worth surfacing - the stream still works.
      })

    const source = new EventSource(streamUrl('firehose'))

    const ingest = (event: MessageEvent) => {
      try {
        const payload: StreamEvent = JSON.parse(event.data)
        setEvents((current) => [payload, ...current].slice(0, CAPACITY))
      } catch {
        // Malformed frame; skip it rather than tearing down the stream.
      }
    }

    source.addEventListener('connected', () => setConnected(true))
    source.addEventListener('progress', ingest)
    source.addEventListener('processed', ingest)
    source.addEventListener('failed', ingest)
    source.onerror = () => setConnected(false)

    return () => {
      cancelled = true
      source.close()
    }
  }, [])

  return { events, connected }
}
