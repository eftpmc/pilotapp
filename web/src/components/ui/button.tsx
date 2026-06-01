import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild: _asChild, ...props }, ref) => {
    const v = variant === 'primary'     ? 'btn primary'
            : variant === 'ghost'       ? 'btn ghost'
            : variant === 'destructive' ? 'btn danger'
            : 'btn'
    const s = size === 'sm' ? 'sm' : ''
    return (
      <button
        ref={ref}
        className={cn(v, s && `${v} ${s}`, className)}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export function buttonVariants({ variant = 'default', size = 'default' }: Pick<ButtonProps, 'variant' | 'size'> = {}) {
  const v = variant === 'primary'     ? 'btn primary'
          : variant === 'ghost'       ? 'btn ghost'
          : variant === 'destructive' ? 'btn danger'
          : 'btn'
  const s = size === 'sm' ? 'sm' : ''
  return cn(v, s && `${v} ${s}`)
}
