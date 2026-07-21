import { useMemo } from 'react'
import { cn } from '@/lib/cn'

/**
 * Deterministic generated artwork.
 *
 * The pipeline does not extract thumbnails, so rather than showing grey boxes
 * every item gets its own stable identity derived from its id: a two-stop mesh
 * in the brand spectrum plus a soft arc motif. The same media always renders
 * the same art, which makes the library scannable by shape and colour.
 */
export function Poster({
  seed,
  title,
  className,
  arcs = true,
}: {
  seed: string
  title: string
  className?: string
  arcs?: boolean
}) {
  const art = useMemo(() => derive(seed), [seed])

  return (
    <div className={cn('relative isolate overflow-hidden bg-abyss', className)} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(120% 90% at ${art.x1}% ${art.y1}%, hsl(${art.hueA} 82% 62% / 0.55), transparent 62%),
            radial-gradient(110% 95% at ${art.x2}% ${art.y2}%, hsl(${art.hueB} 88% 55% / 0.45), transparent 60%),
            linear-gradient(${art.angle}deg, hsl(${art.hueA} 60% 12%), hsl(${art.hueB} 55% 8%))
          `,
        }}
      />

      {arcs && (
        <svg viewBox="0 0 200 200" className="absolute inset-0 size-full opacity-[0.22]" preserveAspectRatio="none">
          {[0, 1, 2].map((ring) => (
            <circle
              key={ring}
              cx={art.cx}
              cy={art.cy}
              r={26 + ring * art.spread}
              fill="none"
              stroke="white"
              strokeWidth="0.6"
            />
          ))}
        </svg>
      )}

      {/* Scrim so overlaid text always clears contrast, whatever the seed produced */}
      <div className="absolute inset-0 bg-gradient-to-t from-void/85 via-void/25 to-transparent" />

      <span className="sr-only">{title}</span>
    </div>
  )
}

interface Art {
  hueA: number
  hueB: number
  x1: number
  y1: number
  x2: number
  y2: number
  angle: number
  cx: number
  cy: number
  spread: number
}

/**
 * FNV-1a over the id, then slice the hash into art parameters. Hues are pinned
 * to the 210-300 arc - the cyan-to-violet signature range - so generated art
 * never fights the palette or collides with the reserved status colours.
 */
function derive(seed: string): Art {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const at = (shift: number, span: number) => Math.abs((hash >>> shift) % span)

  const hueA = 210 + at(0, 90)
  return {
    hueA,
    hueB: 210 + ((hueA - 210 + 34 + at(5, 30)) % 90),
    x1: 12 + at(9, 60),
    y1: 8 + at(13, 55),
    x2: 40 + at(17, 55),
    y2: 45 + at(21, 50),
    angle: 100 + at(25, 80),
    cx: 40 + at(3, 120),
    cy: 40 + at(7, 120),
    spread: 16 + at(11, 22),
  }
}
