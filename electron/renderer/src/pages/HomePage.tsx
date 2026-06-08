export default function HomePage() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'var(--ember)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 28, fontWeight: 800,
          color: '#fff', margin: '0 auto 20px',
        }}>
          p
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Connected</p>
      </div>
    </div>
  )
}
