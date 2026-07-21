import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export type StageState = 'pending' | 'active' | 'done' | 'failed'

export interface Stage {
  id: string
  label: string
  /** What actually happens here, in the system's own terms. */
  hint: string
  state: StageState
  /** 0-100 when the stage reports granular progress. */
  progress?: number | null
  detail?: string | null
}

/**
 * Vertical trace of the real pipeline: register, transfer, publish to Kafka,
 * transcode, then complete. Each node mirrors one hop the file actually makes,
 * so the visualization stays honest rather than decorative.
 */
export function PipelineTrack({ stages }: { stages: Stage[] }) {
  return (
    <ol className="relative">
      {stages.map((stage, index) => (
        <li key={stage.id} className="relative flex gap-4 pb-7 last:pb-0">
          {/* Connector: fills as the stage above completes */}
          {index < stages.length - 1 && (
            <span className="absolute top-9 left-[15px] h-[calc(100%-1.75rem)] w-px bg-white/10">
              <motion.span
                className="from-brand-500 to-pulse-400 block w-full bg-gradient-to-b"
                initial={{ height: 0 }}
                animate={{ height: stage.state === 'done' ? '100%' : '0%' }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </span>
          )}

          <StageNode state={stage.state} />

          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p
                className={cn(
                  'text-[13.5px] font-medium transition-colors duration-500',
                  stage.state === 'pending' ? 'text-white/35' : 'text-white/90',
                )}
              >
                {stage.label}
              </p>
              {stage.state === 'active' && stage.progress != null && (
                <span className="font-mono text-[11px] text-live tabular-nums">{stage.progress}%</span>
              )}
            </div>

            <p className="mt-0.5 text-[11.5px] text-white/30">{stage.hint}</p>

            {stage.state === 'active' && (
              <div className="mt-2.5 h-[3px] max-w-xs overflow-hidden rounded-full bg-white/10">
                {stage.progress != null ? (
                  <motion.div
                    className="from-brand-500 to-pulse-400 h-full rounded-full bg-gradient-to-r"
                    initial={false}
                    animate={{ width: `${stage.progress}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                ) : (
                  <motion.div
                    className="from-brand-500 to-pulse-400 h-full w-1/3 rounded-full bg-gradient-to-r"
                    animate={{ x: ['-100%', '300%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              {stage.detail && (
                <motion.p
                  key={stage.detail}
                  initial={{ opacity: 0, y: -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn(
                    'mt-2 text-[11.5px]',
                    stage.state === 'failed' ? 'text-fail' : 'text-white/45',
                  )}
                >
                  {stage.detail}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </li>
      ))}
    </ol>
  )
}

function StageNode({ state }: { state: StageState }) {
  return (
    <span
      className={cn(
        'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border transition-colors duration-500',
        state === 'done' && 'border-ready/35 bg-ready/12 text-ready',
        state === 'active' && 'border-live/45 bg-live/12 text-live',
        state === 'failed' && 'border-fail/40 bg-fail/12 text-fail',
        state === 'pending' && 'border-white/10 bg-white/[0.03] text-white/25',
      )}
    >
      {state === 'done' && <Check className="size-4" strokeWidth={2.5} />}
      {state === 'active' && <Loader2 className="size-4 animate-spin" />}
      {state === 'failed' && <X className="size-4" strokeWidth={2.5} />}
      {state === 'pending' && <span className="size-1.5 rounded-full bg-current" />}
    </span>
  )
}
