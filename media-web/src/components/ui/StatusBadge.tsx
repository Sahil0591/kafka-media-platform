import { cn } from '@/lib/cn'

export type MediaStatus = 'UPLOADING' | 'PROCESSING' | 'TRANSCODING' | 'READY' | 'FAILED' | string

type Tone = {
  label: string
  dot: string
  text: string
  ring: string
  /** Whether the dot should breathe - reserved for genuinely in-flight states. */
  live: boolean
}

const TONES: Record<string, Tone> = {
  READY: { label: 'Ready', dot: 'bg-ready', text: 'text-ready', ring: 'bg-ready/10 border-ready/25', live: false },
  FAILED: { label: 'Failed', dot: 'bg-fail', text: 'text-fail', ring: 'bg-fail/10 border-fail/25', live: false },
  PROCESSING: {
    label: 'Processing',
    dot: 'bg-live',
    text: 'text-live',
    ring: 'bg-live/10 border-live/25',
    live: true,
  },
  TRANSCODING: {
    label: 'Transcoding',
    dot: 'bg-live',
    text: 'text-live',
    ring: 'bg-live/10 border-live/25',
    live: true,
  },
  UPLOADING: {
    label: 'Uploading',
    dot: 'bg-warn',
    text: 'text-warn',
    ring: 'bg-warn/10 border-warn/25',
    live: true,
  },
}

const UNKNOWN: Tone = {
  label: 'Unknown',
  dot: 'bg-white/40',
  text: 'text-white/55',
  ring: 'bg-white/5 border-white/12',
  live: false,
}

export function toneFor(status: MediaStatus): Tone {
  return TONES[status] ?? { ...UNKNOWN, label: status || 'Unknown' }
}

export function StatusBadge({
  status,
  className,
  compact = false,
}: {
  status: MediaStatus
  className?: string
  compact?: boolean
}) {
  const tone = toneFor(status)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border font-medium whitespace-nowrap',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]',
        tone.ring,
        tone.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', tone.dot, tone.live && 'animate-pulse-ring')} />
      {tone.label}
    </span>
  )
}
