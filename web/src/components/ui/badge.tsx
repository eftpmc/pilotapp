import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive'
}

const variantStyle: Record<string, React.CSSProperties> = {
  default:     { color: 'var(--ember)',  background: 'var(--ember-wash)' },
  secondary:   { color: 'var(--ink-2)', background: 'var(--panel-2)', border: '1px solid var(--rule)' },
  outline:     { color: 'var(--muted)', background: 'var(--panel)',   border: '1px solid var(--rule)' },
  success:     { color: 'var(--green)', background: 'color-mix(in srgb, var(--green) 10%, transparent)' },
  warning:     { color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 10%, transparent)' },
  destructive: { color: 'var(--red)',   background: 'color-mix(in srgb, var(--red)   10%, transparent)' },
}

export function Badge({ className, variant = 'default', style, ...props }: BadgeProps) {
  return (
    <span
      className={cn('chip', className)}
      style={{ ...variantStyle[variant], ...style }}
      {...props}
    />
  )
}
