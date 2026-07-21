import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

/**
 * Standard page container. Every route enters with the same rise-and-fade so
 * navigation feels like one continuous surface rather than a hard cut.
 */
export function Page({
  children,
  className,
  wide = false,
}: {
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn('mx-auto px-5 py-8 sm:px-8 sm:py-10', wide ? 'max-w-[104rem]' : 'max-w-6xl', className)}
    >
      {children}
    </motion.div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-medium tracking-[0.2em] text-white/35 uppercase">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-[1.75rem] sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-white/45">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
    </header>
  )
}
