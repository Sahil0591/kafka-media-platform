import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

/**
 * Labelled magnitude bar.
 *
 * Every row wears the same hue. The categories here - topics, partitions - have
 * no natural order, so shading each bar by its own value would double-encode
 * length as colour and spend the only free channel on information the bar
 * already carries.
 *
 * Label and value are always rendered as text beside the bar, which makes each
 * row its own table view: no value is reachable only by reading a length.
 */
export function BarRow({
  label,
  value,
  max,
  format,
  tone = 'brand',
  hint,
}: {
  label: string
  value: number
  max: number
  format?: (value: number) => string
  /** `warn` marks a row that has crossed a threshold - it is state, not identity. */
  tone?: 'brand' | 'warn'
  hint?: string
}) {
  const fraction = max > 0 ? Math.min(value / max, 1) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-[11px] text-white/55">{label}</span>
        <span className="shrink-0 font-mono text-[11.5px] text-white/85 tabular-nums">
          {format ? format(value) : value.toLocaleString()}
        </span>
      </div>

      {/* Track is a lighter step of the same ramp so state reads across the whole bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <motion.div
          className={cn(
            'h-full rounded-full',
            tone === 'warn' ? 'bg-warn' : 'from-brand-500 to-pulse-400 bg-gradient-to-r',
          )}
          initial={false}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {hint && <p className="font-mono text-[10px] text-white/25">{hint}</p>}
    </div>
  )
}
