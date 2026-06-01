import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const Select      = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn('input', 'flex items-center justify-between gap-2 cursor-pointer', className)}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(className)}
      position={position}
      style={{
        zIndex: 60,
        background: 'var(--bg)',
        border: '1px solid var(--rule)',
        borderRadius: '10px',
        boxShadow: 'var(--shadow-dialog)',
        overflow: 'hidden',
        minWidth: '8rem',
      }}
      {...props}
    >
      <SelectPrimitive.Viewport style={{ padding: '6px' }}>
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(className)}
    style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: '8px',
      padding: '7px 10px 7px 30px', borderRadius: '7px',
      fontSize: '13.5px', color: 'var(--ink)',
      cursor: 'default', outline: 'none', userSelect: 'none',
    }}
    onMouseOver={e => (e.currentTarget.style.background = 'var(--panel)')}
    onMouseOut={e => (e.currentTarget.style.background = 'none')}
    {...props}
  >
    <span style={{ position: 'absolute', left: '10px', display: 'flex', alignItems: 'center' }}>
      <SelectPrimitive.ItemIndicator>
        <Check size={13} style={{ color: 'var(--indigo)' }} />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem }
