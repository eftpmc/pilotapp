import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground',
        'placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60',
        'focus:ring-2 focus:ring-primary/10 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
