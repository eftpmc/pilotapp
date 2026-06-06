import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { admin } from '../api/client'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatUptime(seconds: number): string {
  if (seconds < 60)   return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export default function AdminServerPage() {
  const qc = useQueryClient()
  const { data: info     } = useQuery({ queryKey: ['admin/server-info'], queryFn: () => admin.serverInfo(),  refetchInterval: 30_000 })
  const { data: settings } = useQuery({ queryKey: ['admin/settings'],    queryFn: () => admin.settings() })

  const updateSettings = useMutation({
    mutationFn: (body: Parameters<typeof admin.updateSettings>[0]) => admin.updateSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin/settings'] }),
  })

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] px-6 pt-10 pb-8 flex flex-col gap-8">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Server</h1>
          <p className="text-sm text-muted-foreground mt-1">Configuration and runtime information.</p>
        </div>

        {/* Access */}
        <section className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground/50">Access</p>
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Allow new registrations</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When off, only existing accounts can sign in.
                </p>
              </div>
              {settings && (
                <button
                  onClick={() => updateSettings.mutate({ allowRegistration: !settings.allowRegistration })}
                  className={cn(
                    'relative shrink-0 rounded-full transition-colors cursor-pointer border-none outline-none',
                    settings.allowRegistration ? 'bg-primary' : 'bg-muted-foreground/25'
                  )}
                  style={{ width: 40, height: 22 }}
                >
                  <span className={cn(
                    'absolute top-0.5 rounded-full bg-white shadow transition-transform',
                    settings.allowRegistration ? 'translate-x-[19px]' : 'translate-x-[2px]'
                  )} style={{ width: 18, height: 18 }} />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Runtime */}
        {info && (
          <section className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground/50">Runtime</p>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {([
                ['Version',   info.version],
                ['Node',      info.nodeVersion],
                ['Uptime',    formatUptime(info.uptimeSeconds)],
                ['Users',     String(info.userCount)],
              ] as [string, string][]).map(([label, value], i) => (
                <div key={label} className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-border/40')}>
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
                  <span className="text-xs font-mono text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Storage */}
        {info && (
          <section className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground/50">Storage</p>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {([
                ['Data dir', info.dataDir],
                ['DB size',  formatBytes(info.dbSizeBytes)],
              ] as [string, string][]).map(([label, value], i) => (
                <div key={label} className={cn('flex items-center gap-3 px-4 py-2.5', i > 0 && 'border-t border-border/40')}>
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
                  <span className="text-xs font-mono text-foreground truncate">{value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
