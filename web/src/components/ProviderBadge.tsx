import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function ProviderBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={cn(
      'text-[11px] font-semibold capitalize',
      type === 'claude' && 'text-orange-500 border-orange-500/30 bg-orange-500/10',
      type === 'codex'  && 'text-blue-500 border-blue-500/30 bg-blue-500/10',
    )}>{type}</Badge>
  )
}
