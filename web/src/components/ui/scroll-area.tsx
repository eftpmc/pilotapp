import { forwardRef } from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { cn } from '@/lib/utils'

const ScrollArea = forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} style={{ position: 'relative', overflow: 'hidden' }} className={className} {...props}>
    <ScrollAreaPrimitive.Viewport style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(className)}
    style={{
      display: 'flex',
      touchAction: 'none',
      userSelect: 'none',
      padding: '1px',
      ...(orientation === 'vertical'
        ? { width: 6, height: '100%', borderLeft: '1px solid transparent' }
        : { height: 6, flexDirection: 'column', borderTop: '1px solid transparent' }),
    }}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb
      style={{ flex: 1, borderRadius: 999, background: 'var(--rule)', position: 'relative' }}
    />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
