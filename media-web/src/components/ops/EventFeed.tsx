import { AnimatePresence, motion } from 'framer-motion'
import { Panel, PanelLabel } from '@/components/ui/Panel'
import { clockTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { StreamEvent } from '@/lib/types'

/**
 * Live tail of the event bus.
 *
 * Colour here is a status token - green for completion, red for failure, cyan
 * for work in flight - and every row carries the event type as text, so the
 * meaning never depends on hue alone.
 */
export function EventFeed({ events, connected }: { events: StreamEvent[]; connected: boolean }) {
  return (
    <Panel className="flex flex-col" padded={false}>
      <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
        <PanelLabel>Event feed</PanelLabel>
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              'size-1.5 rounded-full',
              connected ? 'bg-live animate-pulse-ring' : 'bg-white/25',
            )}
          />
          <span className={cn('text-[10.5px] font-medium', connected ? 'text-live' : 'text-white/35')}>
            {connected ? 'streaming' : 'idle'}
          </span>
        </span>
      </div>

      {/* Caps rather than fills: the feed hugs its content until it overflows,
          so a quiet bus does not leave a column of empty glass. */}
      <div className="max-h-[30rem] overflow-y-auto">
        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12px] text-white/30">
            Waiting for traffic. Upload a title to see the bus light up.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            <AnimatePresence initial={false}>
              {events.map((event, index) => (
                <motion.li
                  key={`${event.topic}-${event.partition}-${event.offset}-${index}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-3 px-5 py-2.5"
                >
                  <span className={cn('size-1.5 shrink-0 rounded-full', dotFor(event.type))} />

                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/65">
                    {event.topic}
                  </code>

                  {event.progress != null && (
                    <span className="shrink-0 font-mono text-[10.5px] text-white/45 tabular-nums">
                      {event.progress}%
                    </span>
                  )}

                  <span
                    className="shrink-0 font-mono text-[10px] text-white/25 tabular-nums"
                    title={`partition ${event.partition} offset ${event.offset}`}
                  >
                    p{event.partition}/{event.offset}
                  </span>

                  <span className="shrink-0 font-mono text-[10px] text-white/25 tabular-nums">
                    {clockTime(event.timestamp)}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Panel>
  )
}

function dotFor(type: string): string {
  if (type === 'processed') return 'bg-ready'
  if (type === 'failed') return 'bg-fail'
  return 'bg-live'
}
