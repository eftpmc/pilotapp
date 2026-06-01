import * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground',
        'placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60',
        'focus:ring-2 focus:ring-primary/10 transition-colors resize-y min-h-[80px] leading-relaxed',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }
