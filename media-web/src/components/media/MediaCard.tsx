import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AudioLines, Play, Video } from 'lucide-react'
import { Poster } from '@/components/media/Poster'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { relativeTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { LiveMedia } from '@/hooks/useLibrary'

/**
 * Library tile. Ready items link to the player; anything still in flight shows
 * its live progress instead and is not clickable, so the card never promises
 * playback that would fail.
 */
export function MediaCard({ item, index = 0 }: { item: LiveMedia; index?: number }) {
  const playable = item.status === 'READY'
  const inFlight = item.status === 'PROCESSING' || item.status === 'TRANSCODING'
  const TypeIcon = item.type === 'AUDIO' ? AudioLines : Video

  const body = (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.04, 0.32) }}
      whileHover={playable ? { y: -6 } : undefined}
      className={cn(
        'group glass rounded-panel relative overflow-hidden',
        'transition-[border-color,box-shadow] duration-500',
        playable && 'hover:border-brand-400/40 hover:shadow-[0_30px_70px_-30px_rgba(124,92,255,0.55)]',
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Poster
          seed={item.id}
          title={item.title}
          className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.07]"
        />

        {playable && (
          <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-400 group-hover:opacity-100">
            <span className="grid size-13 place-items-center rounded-full border border-white/25 bg-void/55 backdrop-blur-md">
              <Play className="ml-0.5 size-5 fill-white text-white" />
            </span>
          </div>
        )}

        <div className="absolute top-3 left-3">
          <StatusBadge status={item.status} compact />
        </div>

        <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-lg border border-white/12 bg-void/50 backdrop-blur-md">
          <TypeIcon className="size-3.5 text-white/70" />
        </span>

        {inFlight && <ProgressOverlay progress={item.progress} stage={item.stage} detail={item.detail} />}
      </div>

      <div className="p-4">
        <h3 className="truncate text-[14.5px] font-medium text-white/90">{item.title}</h3>
        <p className="mt-1 text-[11.5px] text-white/35">
          {item.type === 'AUDIO' ? 'Audio' : 'Video'} - updated {relativeTime(item.updatedAt)}
        </p>
      </div>
    </motion.article>
  )

  return playable ? (
    <Link to={`/watch/${item.id}`} className="block rounded-panel">
      {body}
    </Link>
  ) : (
    body
  )
}

/** Live progress rendered over the artwork while the pipeline is working. */
function ProgressOverlay({
  progress,
  stage,
  detail,
}: {
  progress: number | null
  stage: string | null
  detail: string | null
}) {
  const pct = progress ?? 0
  const known = progress !== null

  return (
    <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-void via-void/85 to-transparent px-4 pt-8 pb-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-[10px] tracking-wide text-live uppercase">
          {stage ?? 'queued'}
        </span>
        {known && <span className="font-mono text-[11px] text-white/70 tabular-nums">{pct}%</span>}
      </div>

      <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
        {known ? (
          <motion.div
            className="from-brand-500 to-pulse-400 h-full rounded-full bg-gradient-to-r"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : (
          // Indeterminate: work has started but the worker has not reported yet
          <motion.div
            className="from-brand-500 to-pulse-400 h-full w-1/3 rounded-full bg-gradient-to-r"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {detail && <p className="truncate text-[10.5px] text-white/40">{detail}</p>}
    </div>
  )
}
