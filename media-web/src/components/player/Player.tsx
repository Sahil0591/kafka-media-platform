import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useHls } from '@/components/player/useHls'
import { timecode } from '@/lib/format'
import { cn } from '@/lib/cn'

const HIDE_DELAY_MS = 2600
const SKIP_SECONDS = 10

/**
 * Cinematic HLS player with custom controls.
 *
 * The chrome auto-hides during playback and returns on any pointer or keyboard
 * activity. Keyboard shortcuts are bound on the container rather than the
 * document so the player never steals keys from the rest of the page.
 */
export function Player({ src, title }: { src: string | null; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { levels, currentLevel, activeLevel, error, ready, selectLevel } = useHls(videoRef, src)

  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [time, setTime] = useState(0)
  const [length, setLength] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const revealChrome = useCallback(() => {
    setChromeVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    // While paused or while a menu is open the chrome is deliberately sticky.
    if (!playing || menuOpen) return
    hideTimer.current = setTimeout(() => setChromeVisible(false), HIDE_DELAY_MS)
  }, [playing, menuOpen])

  useEffect(() => {
    revealChrome()
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [revealChrome])

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const video = () => videoRef.current

  function togglePlay() {
    const el = video()
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  function seekTo(seconds: number) {
    const el = video()
    if (!el || !Number.isFinite(el.duration)) return
    el.currentTime = Math.min(Math.max(seconds, 0), el.duration)
  }

  function skip(delta: number) {
    const el = video()
    if (el) seekTo(el.currentTime + delta)
  }

  function toggleMute() {
    const el = video()
    if (!el) return
    el.muted = !el.muted
    setMuted(el.muted)
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await shellRef.current?.requestFullscreen()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const handled: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowRight: () => skip(SKIP_SECONDS),
      ArrowLeft: () => skip(-SKIP_SECONDS),
      m: toggleMute,
      f: () => void toggleFullscreen(),
    }
    const action = handled[event.key]
    if (!action) return
    event.preventDefault()
    action()
    revealChrome()
  }

  return (
    <div
      ref={shellRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={revealChrome}
      onMouseLeave={() => playing && !menuOpen && setChromeVisible(false)}
      className={cn(
        'group/player relative isolate aspect-video w-full overflow-hidden rounded-panel bg-black',
        'border border-white/8 outline-none focus-visible:border-brand-400/50',
        !chromeVisible && playing && 'cursor-none',
      )}
    >
      <video
        ref={videoRef}
        playsInline
        className="size-full"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onDurationChange={(e) => setLength(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume)
          setMuted(e.currentTarget.muted)
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget
          setTime(el.currentTime)
          if (el.buffered.length) setBuffered(el.buffered.end(el.buffered.length - 1))
        }}
      />

      {(waiting || (!ready && !error)) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Loader2 className="size-8 animate-spin text-white/70" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-void/80 px-6 text-center">
          <p className="text-sm text-white/70">{error}</p>
        </div>
      )}

      {/* Large centre affordance while paused */}
      <AnimatePresence>
        {!playing && ready && !error && (
          <motion.button
            type="button"
            aria-label="Play"
            onClick={togglePlay}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 grid place-items-center"
          >
            <span className="grid size-18 place-items-center rounded-full border border-white/25 bg-void/50 backdrop-blur-lg transition-transform duration-300 hover:scale-105">
              <Play className="ml-1 size-7 fill-white text-white" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chromeVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pt-16 pb-4 sm:px-5"
          >
            <Scrubber time={time} length={length} buffered={buffered} onSeek={seekTo} />

            <div className="mt-3 flex items-center gap-1.5">
              <IconButton label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                {playing ? <Pause className="size-4.5 fill-current" /> : <Play className="size-4.5 fill-current" />}
              </IconButton>

              <IconButton label="Back 10 seconds" onClick={() => skip(-SKIP_SECONDS)} className="hidden sm:grid">
                <RotateCcw className="size-4" />
              </IconButton>
              <IconButton label="Forward 10 seconds" onClick={() => skip(SKIP_SECONDS)} className="hidden sm:grid">
                <RotateCw className="size-4" />
              </IconButton>

              <VolumeControl
                muted={muted}
                volume={volume}
                onToggle={toggleMute}
                onChange={(next) => {
                  const el = video()
                  if (!el) return
                  el.volume = next
                  el.muted = next === 0
                }}
              />

              <span className="ml-1 font-mono text-[11.5px] text-white/60 tabular-nums">
                {timecode(time)} <span className="text-white/25">/</span> {timecode(length)}
              </span>

              <div className="ml-auto flex items-center gap-1.5">
                {levels.length > 1 && (
                  <QualityMenu
                    levels={levels}
                    currentLevel={currentLevel}
                    activeLevel={activeLevel}
                    open={menuOpen}
                    onOpenChange={setMenuOpen}
                    onSelect={selectLevel}
                  />
                )}

                <IconButton label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()}>
                  {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                </IconButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title fades in with the chrome, matching streaming-app convention */}
      <AnimatePresence>
        {chromeVisible && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-5 pt-4 pb-12"
          >
            <p className="truncate text-[13px] font-medium text-white/85">{title}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Progress bar with a buffered track. Thickens on hover to widen the hit area. */
function Scrubber({
  time,
  length,
  buffered,
  onSeek,
}: {
  time: number
  length: number
  buffered: number
  onSeek: (seconds: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const played = length > 0 ? (time / length) * 100 : 0
  const loaded = length > 0 ? (buffered / length) * 100 : 0

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || length <= 0) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
      onSeek(ratio * length)
    },
    [length, onSeek],
  )

  // Drag continues outside the track, matching every native scrubber.
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => seekFromPointer(e.clientX)
    const up = () => setDragging(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, seekFromPointer])

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(length)}
      aria-valuenow={Math.round(time)}
      tabIndex={0}
      onPointerDown={(e) => {
        setDragging(true)
        seekFromPointer(e.clientX)
      }}
      className="group/scrub relative -my-2 cursor-pointer py-2"
    >
      {/* Three stacked layers: track, buffered, played */}
      <div className="relative h-[3px] overflow-hidden rounded-full bg-white/18 transition-all duration-200 group-hover/scrub:h-[5px]">
        <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${loaded}%` }} />
        <div
          className="from-brand-400 to-pulse-400 absolute inset-y-0 left-0 bg-gradient-to-r"
          style={{ width: `${played}%` }}
        />
      </div>

      <span
        className={cn(
          'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-lg',
          'transition-opacity duration-200',
          dragging ? 'opacity-100' : 'opacity-0 group-hover/scrub:opacity-100',
        )}
        style={{ left: `${played}%` }}
      />
    </div>
  )
}

function VolumeControl({
  muted,
  volume,
  onToggle,
  onChange,
}: {
  muted: boolean
  volume: number
  onToggle: () => void
  onChange: (value: number) => void
}) {
  return (
    <div className="group/vol flex items-center">
      <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggle}>
        {muted || volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </IconButton>

      {/* Expands on hover so the bar never crowds the control row at rest */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Volume"
        className={cn(
          'h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/25 opacity-0 transition-all duration-300',
          'group-hover/vol:ml-2 group-hover/vol:w-16 group-hover/vol:opacity-100',
          'focus-visible:ml-2 focus-visible:w-16 focus-visible:opacity-100',
          '[&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white',
        )}
      />
    </div>
  )
}

function QualityMenu({
  levels,
  currentLevel,
  activeLevel,
  open,
  onOpenChange,
  onSelect,
}: {
  levels: { index: number; height: number; bitrate: number }[]
  currentLevel: number
  activeLevel: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (index: number) => void
}) {
  const autoLabel = levels.find((level) => level.index === activeLevel)?.height

  return (
    <div className="relative">
      <IconButton label="Quality" onClick={() => onOpenChange(!open)} active={open}>
        <Settings2 className="size-4" />
      </IconButton>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="glass absolute right-0 bottom-11 w-40 rounded-xl p-1.5"
          >
            <MenuRow
              label="Auto"
              detail={currentLevel === -1 && autoLabel ? `${autoLabel}p` : undefined}
              selected={currentLevel === -1}
              onClick={() => {
                onSelect(-1)
                onOpenChange(false)
              }}
            />
            {levels.map((level) => (
              <MenuRow
                key={level.index}
                label={`${level.height}p`}
                detail={`${Math.round(level.bitrate / 1000)}k`}
                selected={currentLevel === level.index}
                onClick={() => {
                  onSelect(level.index)
                  onOpenChange(false)
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MenuRow({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string
  detail?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors',
        selected ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/[0.06] hover:text-white',
      )}
    >
      <span>{label}</span>
      {detail && <span className="font-mono text-[10px] text-white/35">{detail}</span>}
    </button>
  )
}

function IconButton({
  label,
  onClick,
  active,
  className,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-9 place-items-center rounded-lg transition-colors duration-200',
        active ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  )
}
