import { Panel } from '@/components/ui/Panel'
import { cn } from '@/lib/cn'

/**
 * Headline figure.
 *
 * The value uses proportional figures - `tabular-nums` gives every digit the
 * width of a zero, which makes a number like 121 look loose at display size.
 * Tabular is reserved for columns that align vertically.
 */
export function StatTile({
  label,
  value,
  unit,
  detail,
  tone = 'default',
  children,
}: {
  label: string
  value: string
  unit?: string
  detail?: string
  tone?: 'default' | 'good' | 'warn'
  children?: React.ReactNode
}) {
  return (
    <Panel className="flex flex-col justify-between">
      <p className="text-[11px] font-medium tracking-[0.14em] text-white/40 uppercase">{label}</p>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={cn(
            'font-display text-[1.85rem] leading-none font-semibold',
            tone === 'good' && 'text-ready',
            tone === 'warn' && 'text-warn',
            tone === 'default' && 'text-white',
          )}
        >
          {value}
        </span>
        {unit && <span className="text-[12px] text-white/35">{unit}</span>}
      </div>

      {detail && <p className="mt-1.5 text-[11.5px] text-white/30">{detail}</p>}

      {children && <div className="mt-4">{children}</div>}
    </Panel>
  )
}
