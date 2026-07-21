import { cn } from '@/lib/cn'

/**
 * Ambient background: three slow-drifting colour fields behind a vignette.
 *
 * Fixed and non-interactive, it gives flat black pages a sense of depth
 * without competing with content. Rendered once at the app shell level.
 */
export function Aurora({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none fixed inset-0 -z-10 overflow-hidden', className)}>
      <div className="absolute inset-0 bg-void" />

      <div className="animate-aurora absolute -top-1/3 -left-1/4 h-[70vmax] w-[70vmax] rounded-full bg-[radial-gradient(circle,rgba(124,92,255,0.20),transparent_62%)] blur-3xl" />
      <div
        className="animate-aurora absolute -right-1/4 -bottom-1/3 h-[62vmax] w-[62vmax] rounded-full bg-[radial-gradient(circle,rgba(18,184,214,0.16),transparent_62%)] blur-3xl"
        style={{ animationDelay: '-9s' }}
      />
      <div
        className="animate-aurora absolute top-1/4 left-1/2 h-[46vmax] w-[46vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(76,34,204,0.16),transparent_65%)] blur-3xl"
        style={{ animationDelay: '-18s' }}
      />

      {/* Vignette pulls the eye toward the centre of the frame */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,5,9,0.85)_100%)]" />
    </div>
  )
}
