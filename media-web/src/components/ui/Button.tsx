import { motion, type HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'glass' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  // The only element on screen carrying the full signature gradient, so the
  // primary action is never ambiguous.
  primary:
    'text-white bg-gradient-to-r from-brand-600 to-brand-500 shadow-[0_10px_30px_-10px_rgba(124,92,255,0.75)] hover:shadow-[0_14px_38px_-10px_rgba(124,92,255,0.95)]',
  glass: 'glass text-white/90 hover:text-white hover:border-white/20',
  ghost: 'text-white/65 hover:text-white hover:bg-white/[0.06]',
  danger: 'text-fail bg-fail/10 border border-fail/25 hover:bg-fail/20 hover:text-white',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-13 px-7 text-[15px] gap-2.5 rounded-2xl',
}

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant
  size?: Size
  loading?: boolean
  children?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const inert = disabled || loading

  return (
    <motion.button
      whileHover={inert ? undefined : { y: -1 }}
      whileTap={inert ? undefined : { scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={inert}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center font-medium tracking-[-0.01em] whitespace-nowrap',
        'transition-colors duration-300 select-none',
        'disabled:pointer-events-none disabled:opacity-45',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  )
}
