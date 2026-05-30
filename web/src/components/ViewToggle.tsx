import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'grid' | 'list'

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
      {(['grid', 'list'] as const).map(m => {
        const Icon = m === 'grid' ? LayoutGrid : List
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={cn(
              'p-1.5 rounded-md cursor-pointer border-none transition-all',
              mode === m
                ? 'bg-card text-foreground shadow-sm'
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
