import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { streamUrl } from '@/lib/api'
import type { StreamEvent } from '@/lib/types'

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline'

interface StreamState {
  connection: ConnectionState
  /** Most recent event per media id - drives inline progress across the app. */
  latestByMedia: Map<string, StreamEvent>
  /** Newest-first rolling log, capped so a long session cannot grow unbounded. */
  log: StreamEvent[]
  eventsSeen: number
}

const LOG_CAPACITY = 150

const StreamContext = createContext<StreamState | null>(null)

/**
 * Holds the owner-scoped SSE connection for the whole session.
 *
 * Mounted once inside the authenticated shell so navigating between routes
 * never drops the stream. EventSource reconnects on its own; the state machine
 * here exists to tell the user which of those phases they are in.
 */
export function StreamProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [connection, setConnection] = useState<ConnectionState>('offline')
  const [latestByMedia, setLatestByMedia] = useState<Map<string, StreamEvent>>(new Map())
  const [log, setLog] = useState<StreamEvent[]>([])
  const [eventsSeen, setEventsSeen] = useState(0)

  /** Distinguishes a first-connect failure from a mid-session drop. */
  const everConnected = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setConnection('offline')
      return
    }

    everConnected.current = false
    setConnection('connecting')

    const source = new EventSource(streamUrl('events'))

    const ingest = (event: MessageEvent) => {
      let payload: StreamEvent
      try {
        payload = JSON.parse(event.data)
      } catch {
        return
      }

      setEventsSeen((count) => count + 1)
      setLog((current) => [payload, ...current].slice(0, LOG_CAPACITY))

      if (payload.mediaId) {
        setLatestByMedia((current) => {
          const next = new Map(current)
          next.set(payload.mediaId!, payload)
          return next
        })
      }
    }

    source.addEventListener('connected', () => {
      everConnected.current = true
      setConnection('live')
    })
    source.addEventListener('progress', ingest)
    source.addEventListener('processed', ingest)
    source.addEventListener('failed', ingest)

    source.onerror = () => {
      // readyState CLOSED means EventSource gave up entirely.
      if (source.readyState === EventSource.CLOSED) setConnection('offline')
      else setConnection(everConnected.current ? 'reconnecting' : 'connecting')
    }

    return () => {
      source.close()
      setConnection('offline')
    }
  }, [enabled])

  const value = useMemo<StreamState>(
    () => ({ connection, latestByMedia, log, eventsSeen }),
    [connection, latestByMedia, log, eventsSeen],
  )

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>
}

export function useStream(): StreamState {
  const context = useContext(StreamContext)
  if (!context) throw new Error('useStream must be used inside StreamProvider')
  return context
}

/** Convenience hook for a single item's live state. */
export function useMediaEvent(mediaId: string | undefined): StreamEvent | undefined {
  const { latestByMedia } = useStream()
  return mediaId ? latestByMedia.get(mediaId) : undefined
}
