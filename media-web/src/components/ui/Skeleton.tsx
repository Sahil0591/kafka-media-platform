import { cn } from '@/lib/cn'

/**
 * Loading placeholder with a light sweep. Sized by the caller so the skeleton
 * occupies the same box the real content will, avoiding layout shift.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-white/[0.055]', className)}>
      <div className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  )
}
