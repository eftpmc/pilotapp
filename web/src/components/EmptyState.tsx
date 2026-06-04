import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-8 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-muted/60 flex items-center justify-center">
        <Icon size={28} className="text-muted-foreground opacity-65" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">{description}</p>
      </div>
      {action && (
        <Button size="sm" variant="outline" className="mt-1" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
