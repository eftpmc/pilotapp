import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:     'bg-primary/8 text-primary',
        pill:        'bg-primary/8 text-primary',
        secondary:   'bg-secondary text-secondary-foreground',
        outline:     'bg-muted text-muted-foreground border-0',
        success:     'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
        warning:     'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
        destructive: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
