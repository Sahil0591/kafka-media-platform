import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface Point {
  t: number
  v: number
}

const WIDTH = 100
const HEIGHT = 34

/**
 * Single-series trend line.
 *
 * One hue - this plots magnitude over time, not identity, so there is nothing
 * for a categorical palette to distinguish and no legend to draw. The area is a
 * 10% wash rather than a saturated block, the line is 2px, and the endpoint dot
 * carries a surface-coloured ring so it stays legible where it meets the line.
 *
 * Hover is part of the contract: the tooltip is a convenience, and the value is
 * always also printed by the caller, so nothing is gated behind a pointer.
 */
export function Sparkline({
  points,
  format,
  className,
}: {
  points: Point[]
  format?: (value: number) => string
  className?: string
}) {
  const gradientId = useId()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => {
    if (points.length < 2) return null

    const values = points.map((point) => point.v)
    const max = Math.max(...values)
    // Anchor the floor at zero so the line never exaggerates small variation.
    const min = 0
    const span = max - min || 1

    const coords = points.map((point, index) => ({
      x: (index / (points.length - 1)) * WIDTH,
      y: HEIGHT - ((point.v - min) / span) * (HEIGHT - 4) - 2,
      value: point.v,
    }))

    return {
      coords,
      line: coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' '),
      area: `M0,${HEIGHT} ${coords
        .map((c) => `L${c.x.toFixed(2)},${c.y.toFixed(2)}`)
        .join(' ')} L${WIDTH},${HEIGHT} Z`,
      last: coords[coords.length - 1],
    }
  }, [points])

  if (!geometry) {
    return (
      <div className={cn('grid h-9 place-items-center', className)}>
        <span className="text-[10.5px] text-white/25">gathering</span>
      </div>
    )
  }

  const active = hover !== null ? geometry.coords[hover] : null

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const ratio = (event.clientX - rect.left) / rect.width
    const index = Math.round(ratio * (geometry!.coords.length - 1))
    setHover(Math.min(Math.max(index, 0), geometry!.coords.length - 1))
  }

  return (
    <div className={cn('relative', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-9 w-full touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-brand-400)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-brand-400)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={geometry.area} fill={`url(#${gradientId})`} />
        <path
          d={geometry.line}
          fill="none"
          stroke="var(--color-brand-400)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <line
            x1={active.x}
            y1="0"
            x2={active.x}
            y2={HEIGHT}
            stroke="white"
            strokeOpacity="0.25"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Endpoint marker, ringed in the surface colour so it reads over the line */}
        <circle
          cx={geometry.last.x}
          cy={geometry.last.y}
          r="4"
          fill="var(--color-brand-400)"
          stroke="var(--color-surface)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {active && (
        <span
          className="glass pointer-events-none absolute -top-1 rounded-lg px-2 py-1 font-mono text-[10px] text-white/85 tabular-nums"
          style={{
            left: `${active.x}%`,
            transform: `translateX(${active.x > 70 ? '-100%' : active.x < 30 ? '0%' : '-50%'})`,
          }}
        >
          {format ? format(active.value) : active.value.toFixed(1)}
        </span>
      )}
    </div>
  )
}
