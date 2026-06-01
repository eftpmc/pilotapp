import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
}

const base = 'inline-flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none'

const variantMap: Record<NonNullable<ButtonProps['variant']>, string> = {
  default:     'bg-card border border-border text-foreground hover:bg-muted rounded-lg',
  primary:     'bg-primary border border-primary text-primary-foreground hover:bg-primary/90 rounded-lg',
  secondary:   'bg-muted border border-border text-foreground hover:bg-muted/80 rounded-lg',
  outline:     'bg-transparent border border-border text-foreground hover:bg-muted rounded-lg',
  ghost:       'bg-transparent border border-transparent text-foreground hover:bg-muted rounded-lg',
  destructive: 'bg-transparent border border-transparent text-destructive hover:bg-destructive/10 rounded-lg',
  link:        'bg-transparent border-none text-primary underline-offset-4 hover:underline p-0 h-auto',
}

const sizeMap: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'h-9 px-3.5 text-[13px]',
  sm:      'h-7 px-2.5 text-xs',
  lg:      'h-11 px-5 text-sm',
  icon:    'h-8 w-8 p-0 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild: _asChild, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variantMap[variant], sizeMap[size], className)}
      {...props}
    />
  )
)
Button.displayName = 'Button'

export function buttonVariants({ variant = 'default', size = 'default' }: Pick<ButtonProps, 'variant' | 'size'> = {}) {
  return cn(base, variantMap[variant], sizeMap[size])
}
