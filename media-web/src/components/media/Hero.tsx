import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Play, Radio } from 'lucide-react'
import { Poster } from '@/components/media/Poster'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { relativeTime } from '@/lib/format'
import type { LiveMedia } from '@/hooks/useLibrary'

/**
 * Cinematic banner for the most recently finished title.
 *
 * A tall poster with a two-axis scrim - vertical for the copy block, horizontal
 * so the frame dissolves into the page rather than ending on a hard edge.
 */
export function Hero({ item, inFlightCount }: { item: LiveMedia; inFlightCount: number }) {
  const navigate = useNavigate()

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-panel relative isolate overflow-hidden border border-white/8"
    >
      <div className="relative aspect-[16/10] sm:aspect-[21/9] lg:aspect-[2.6/1]">
        <Poster seed={item.id} title={item.title} className="absolute inset-0" arcs />

        {/* Layered scrims keep the headline legible over any generated seed */}
        <div className="absolute inset-0 bg-gradient-to-t from-void via-void/55 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-void via-void/45 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-9 lg:p-12">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge status={item.status} />
            {inFlightCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-live/25 bg-live/10 px-2.5 py-1 text-[11px] font-medium text-live">
                <Radio className="size-3" />
                {inFlightCount} in the pipeline
              </span>
            )}
          </div>

          <h2 className="mt-4 max-w-3xl text-[2rem] leading-[1.06] sm:text-[2.75rem] lg:text-[3.25rem]">
            {item.title}
          </h2>

          <p className="mt-2.5 text-[13px] text-white/45">
            {item.type === 'AUDIO' ? 'Audio' : 'Video'} - adaptive HLS - ready {relativeTime(item.updatedAt)}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => navigate(`/watch/${item.id}`)}>
              <Play className="size-4 fill-current" />
              Play
            </Button>
            <Button size="lg" variant="glass" onClick={() => navigate('/pulse')}>
              View pipeline
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
