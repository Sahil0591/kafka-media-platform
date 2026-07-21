import { cn } from '@/lib/cn'

/**
 * The aperture mark: concentric rings around a solid core, echoing both a lens
 * iris and a Kafka partition ring.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <defs>
        <linearGradient id="aperture-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand-400)" />
          <stop offset="1" stopColor="var(--color-pulse-400)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="url(#aperture-mark)" strokeWidth="1" opacity="0.35" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="url(#aperture-mark)" strokeWidth="2.25" />
      <circle cx="16" cy="16" r="2.75" fill="url(#aperture-mark)" />
    </svg>
  )
}

export function Wordmark({ className, showMark = true }: { className?: string; showMark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {showMark && <Mark />}
      <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-white">
        Aperture
      </span>
    </span>
  )
}
