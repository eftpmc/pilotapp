import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted/70', className)} />
}

export function CardSkeleton() {
  return (
    <div className="bg-card rounded-xl p-3.5 border border-border/40 flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-6 h-6 rounded-lg shrink-0" />
        <Skeleton className="h-3.5 w-28" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-5 w-24 rounded-full" />
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
      <Skeleton className="w-2 h-2 rounded-full shrink-0" />
      <Skeleton className="h-3.5 flex-1 max-w-[200px]" />
      <Skeleton className="h-3 w-24 ml-auto" />
      <Skeleton className="h-5 w-14 rounded-full" />
    </div>
  )
}
