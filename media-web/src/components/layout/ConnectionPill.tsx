import { motion } from 'framer-motion'
import { useStream, type ConnectionState } from '@/stream/StreamProvider'
import { cn } from '@/lib/cn'

const COPY: Record<ConnectionState, { label: string; dot: string; text: string; breathing: boolean }> = {
  live: { label: 'Live', dot: 'bg-live', text: 'text-live', breathing: true },
  connecting: { label: 'Connecting', dot: 'bg-warn', text: 'text-warn', breathing: true },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warn', text: 'text-warn', breathing: true },
  offline: { label: 'Offline', dot: 'bg-white/35', text: 'text-white/40', breathing: false },
}

/**
 * Ambient truth about the event connection. Always visible in the shell so the
 * user knows whether what they are looking at is current.
 */
export function ConnectionPill({ className }: { className?: string }) {
  const { connection, eventsSeen } = useStream()
  const tone = COPY[connection]

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5',
        className,
      )}
      title={`${eventsSeen} events received this session`}
    >
      <span className={cn('size-1.5 rounded-full', tone.dot, tone.breathing && 'animate-pulse-ring')} />
      <span className={cn('text-[11px] font-medium tracking-wide', tone.text)}>{tone.label}</span>

      {eventsSeen > 0 && (
        <motion.span
          key={eventsSeen}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="font-mono text-[10px] text-white/30 tabular-nums"
        >
          {eventsSeen}
        </motion.span>
      )}
    </div>
  )
}
