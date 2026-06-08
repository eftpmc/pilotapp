export default function OnboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
    }}>
      {/* Top wordmark */}
      <div style={{
        padding: '28px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--ember)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 900, color: '#fff',
        }}>p</div>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>pilot</span>
      </div>

      {/* Centered content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px 64px',
      }}>
        {children}
      </div>
    </div>
  )
}
