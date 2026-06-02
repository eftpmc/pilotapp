import type { LucideIcon } from 'lucide-react'

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '80px 32px', textAlign: 'center', userSelect: 'none' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'color-mix(in srgb, var(--panel-2) 60%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={28} style={{ color: 'var(--muted)', opacity: 0.65 }} strokeWidth={1.5} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 220, margin: 0 }}>{description}</p>
      </div>
      {action && (
        <button className="btn sm" onClick={action.onClick} style={{ marginTop: 4 }}>
          {action.label}
        </button>
      )}
    </div>
  )
}
