import { forwardRef, useId } from 'react'
import { cn } from '@/lib/cn'

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  icon?: React.ReactNode
}

/**
 * Text input with a floating label frame. The border brightens on focus rather
 * than changing colour outright, which keeps forms calm on a dark canvas.
 */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, icon, className, id, ...props },
  ref,
) {
  const generated = useId()
  const inputId = id ?? generated

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-[11px] font-medium tracking-[0.14em] text-white/45 uppercase"
      >
        {label}
      </label>

      <div
        className={cn(
          'group relative flex items-center rounded-xl border bg-white/[0.03] transition-all duration-300',
          'focus-within:border-brand-400/50 focus-within:bg-white/[0.055]',
          'focus-within:shadow-[0_0_0_4px_rgba(124,92,255,0.10)]',
          error ? 'border-fail/45' : 'border-white/10',
        )}
      >
        {icon && <span className="pl-3.5 text-white/30 transition-colors group-focus-within:text-brand-400">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'h-11 w-full bg-transparent px-3.5 text-sm text-white placeholder:text-white/25',
            'outline-none',
            className,
          )}
          {...props}
        />
      </div>

      {(error || hint) && (
        <p className={cn('text-xs', error ? 'text-fail' : 'text-white/35')}>{error ?? hint}</p>
      )}
    </div>
  )
})
