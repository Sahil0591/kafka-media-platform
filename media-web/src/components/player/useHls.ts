import { useEffect, useRef, useState } from 'react'
// The light build drops alternate audio tracks, subtitles and EME. This
// pipeline produces video-only HLS ladders, so none of that is reachable and
// the smaller bundle is a straight win.
import Hls from 'hls.js/light'

export interface Level {
  index: number
  height: number
  bitrate: number
}

export interface HlsState {
  levels: Level[]
  /** -1 means adaptive selection is in control. */
  currentLevel: number
  activeLevel: number
  error: string | null
  ready: boolean
}

/**
 * Attaches an HLS source to a video element.
 *
 * Two paths exist: hls.js via Media Source Extensions on most browsers, and
 * native playback on Safari, which handles HLS itself and exposes no level API.
 * Callers get the same state shape either way; on the native path the level
 * list is simply empty and the quality menu hides itself.
 */
export function useHls(videoRef: React.RefObject<HTMLVideoElement | null>, src: string | null) {
  const hlsRef = useRef<Hls | null>(null)
  const [state, setState] = useState<HlsState>({
    levels: [],
    currentLevel: -1,
    activeLevel: -1,
    error: null,
    ready: false,
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setState({ levels: [], currentLevel: -1, activeLevel: -1, error: null, ready: false })

    if (!Hls.isSupported()) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        setState((s) => ({ ...s, ready: true }))
        return
      }
      setState((s) => ({ ...s, error: 'This browser cannot play HLS streams.' }))
      return
    }

    const hls = new Hls({
      // Modest buffers: this is a local pipeline, not a CDN, and a smaller
      // window makes quality switches visible almost immediately.
      maxBufferLength: 20,
      maxMaxBufferLength: 60,
      enableWorker: true,
    })
    hlsRef.current = hls

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      setState((s) => ({
        ...s,
        ready: true,
        levels: data.levels
          .map((level, index) => ({ index, height: level.height, bitrate: level.bitrate }))
          .sort((a, b) => b.height - a.height),
      }))
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      setState((s) => ({ ...s, activeLevel: data.level }))
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return
      // Network and media faults are recoverable; anything else is terminal.
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
      else setState((s) => ({ ...s, error: 'Playback failed. The stream may still be publishing.' }))
    })

    hls.loadSource(src)
    hls.attachMedia(video)

    return () => {
      hls.destroy()
      hlsRef.current = null
    }
  }, [src, videoRef])

  function selectLevel(index: number) {
    if (hlsRef.current) hlsRef.current.currentLevel = index
    setState((s) => ({ ...s, currentLevel: index }))
  }

  return { ...state, selectLevel }
}
