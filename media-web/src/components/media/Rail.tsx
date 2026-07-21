import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Horizontal content rail with snap scrolling.
 *
 * Arrows are pointer affordances only - they appear on hover, and only on the
 * side that can actually scroll. Keyboard and touch users get native scrolling,
 * so nothing here is required to reach the content.
 */
export function Rail({
  title,
  count,
  children,
  className,
}: {
  title: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const maxScroll = track.scrollWidth - track.clientWidth
    setCanScroll({
      left: track.scrollLeft > 8,
      right: track.scrollLeft < maxScroll - 8,
    })
  }, [])

  useEffect(() => {
    measure()
    const track = trackRef.current
    if (!track) return
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure, children])

  function nudge(direction: -1 | 1) {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * track.clientWidth * 0.82, behavior: 'smooth' })
  }

  return (
    <section className={cn('group/rail relative', className)}>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[1.05rem] font-semibold text-white/85">{title}</h2>
        {count !== undefined && (
          <span className="font-mono text-[11px] text-white/25 tabular-nums">{count}</span>
        )}
      </div>

      <div className="relative">
        <div
          ref={trackRef}
          onScroll={measure}
          className="no-scrollbar edge-fade-x -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2"
        >
          {children}
        </div>

        <AnimatePresence>
          {canScroll.left && <Arrow side="left" onClick={() => nudge(-1)} />}
          {canScroll.right && <Arrow side="right" onClick={() => nudge(1)} />}
        </AnimatePresence>
      </div>
    </section>
  )
}

function Arrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <motion.button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        'glass absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full',
        'opacity-0 transition-opacity duration-300 group-hover/rail:opacity-100 md:grid',
        side === 'left' ? '-left-3' : '-right-3',
      )}
    >
      <Icon className="size-4.5 text-white/80" />
    </motion.button>
  )
}
