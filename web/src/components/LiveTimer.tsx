import { useElapsed, fmtSecs } from '@pilot/shared'

export function LiveTimer({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--green-dot)] animate-[pulse_1.6s_ease-out_infinite]" />
      <span className="text-xs text-[var(--green)] font-medium tabular-nums">{fmtSecs(secs)}</span>
    </div>
  )
}
