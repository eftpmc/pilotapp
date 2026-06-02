import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const variantClass: Record<string, string> = {
  default:     '',
  primary:     'primary',
  secondary:   '',
  outline:     '',
  ghost:       'ghost',
  destructive: 'danger',
}

const sizeClass: Record<string, string> = {
  default: '',
  sm:      'sm',
  lg:      'lg',
  icon:    'icon',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn('btn', variantClass[variant], sizeClass[size], className)}
      {...props}
    />
  )
)
Button.displayName = 'Button'
