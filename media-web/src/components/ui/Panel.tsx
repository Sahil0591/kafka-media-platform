import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Adds a lift-and-glow response to pointer hover. */
  interactive?: boolean
  padded?: boolean
}

/** The workhorse frosted surface. Everything that groups content sits on one. */
export function Panel({ interactive, padded = true, className, children, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'glass rounded-panel relative overflow-hidden',
        padded && 'p-5 sm:p-6',
        interactive && 'glass-hover',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** Panel that fades and rises into place - used for content that arrives async. */
export function PanelIn({
  delay = 0,
  className,
  children,
  ...props
}: { delay?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
      className={cn('glass rounded-panel relative overflow-hidden p-5 sm:p-6', className)}
      {...(props as React.ComponentProps<typeof motion.div>)}
    >
      {children}
    </motion.div>
  )
}

/** Small caps label used above every panel's content. */
export function PanelLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn('text-[11px] font-medium tracking-[0.16em] text-white/40 uppercase', className)}>
      {children}
    </p>
  )
}
