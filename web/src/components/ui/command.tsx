import { Command as Cmdk } from 'cmdk'
import { Search } from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { cn } from '@/lib/utils'

export const Command = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Cmdk>) => (
  <Cmdk
    className={cn('flex h-full w-full flex-col overflow-hidden', className)}
    {...props}
  />
)

export function CommandDialog({ open, onOpenChange, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[20vh] z-50 w-full max-w-[560px] -translate-x-1/2 rounded-2xl bg-[var(--panel)] shadow-2xl ring-1 ring-[var(--rule-soft)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 overflow-hidden">
          <VisuallyHidden.Root><DialogPrimitive.Title>Command palette</DialogPrimitive.Title></VisuallyHidden.Root>
          <Command>{children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export const CommandInput = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Cmdk.Input>) => (
  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--rule-soft)]">
    <Search size={15} className="text-[var(--muted)] shrink-0" />
    <Cmdk.Input
      className={cn('flex-1 bg-transparent text-sm text-foreground placeholder:text-[var(--muted)] outline-none', className)}
      {...props}
    />
  </div>
)

export const CommandList = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Cmdk.List>) => (
  <Cmdk.List className={cn('max-h-[360px] overflow-y-auto overscroll-contain p-2', className)} {...props} />
)

export const CommandEmpty = (props: React.ComponentPropsWithoutRef<typeof Cmdk.Empty>) => (
  <Cmdk.Empty className="py-10 text-center text-sm text-[var(--muted)]" {...props} />
)

export const CommandGroup = ({ className, heading, ...props }: React.ComponentPropsWithoutRef<typeof Cmdk.Group> & { heading?: string }) => (
  <Cmdk.Group
    heading={heading}
    className={cn('[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--faint)]', className)}
    {...props}
  />
)

export const CommandItem = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Cmdk.Item>) => (
  <Cmdk.Item
    className={cn(
      'flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer select-none text-foreground',
      'aria-selected:bg-[var(--panel-2)]',
      'data-[disabled=true]:opacity-40 data-[disabled=true]:pointer-events-none',
      className
    )}
    {...props}
  />
)

export const CommandSeparator = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof Cmdk.Separator>) => (
  <Cmdk.Separator className={cn('h-px bg-[var(--rule-soft)] my-1.5 mx-2', className)} {...props} />
)

export const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs text-[var(--faint)]', className)} {...props} />
)
