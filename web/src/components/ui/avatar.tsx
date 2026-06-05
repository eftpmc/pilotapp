import * as React from 'react'
import { cn } from '@/lib/utils'

export function Avatar({
  className,
  size = 28,
  children,
  style,
}: {
  className?: string
  size?: number
  children?: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, ...style }}
    >
      {children}
    </span>
  )
}

export function AvatarFallback({
  className,
  children,
}: {
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground',
      className,
    )}>
      {children}
    </span>
  )
}

// Stacked overlapping avatar group
export function AvatarGroup({
  children,
  max = 5,
  size = 28,
  className,
}: {
  children: React.ReactNode
  max?: number
  size?: number
  className?: string
}) {
  const arr = React.Children.toArray(children)
  const visible  = arr.slice(0, max)
  const overflow = arr.length - max

  return (
    <div className={cn('flex items-center', className)} style={{ gap: 0 }}>
      {visible.map((child, i) => (
        <span
          key={i}
          className="ring-[1.5px] ring-background rounded-full"
          style={{ marginLeft: i === 0 ? 0 : -(size * 0.35) }}
        >
          {child}
        </span>
      ))}
      {overflow > 0 && (
        <Avatar
          size={size}
          className="ring-[1.5px] ring-background"
          style={{ marginLeft: -(size * 0.35) }}
        >
          <AvatarFallback>+{overflow}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
