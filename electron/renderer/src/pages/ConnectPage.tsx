import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveServerUrl } from '@/api'
import { addServer, getServers } from '@/pages/ServersPage'
import OnboardShell from '@/components/OnboardShell'

export default function ConnectPage() {
  const [url, setUrl] = useState('http://localhost:3000')
  const navigate = useNavigate()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    try { new URL(trimmed) } catch { return }
    addServer(trimmed)
    saveServerUrl(trimmed)
    navigate('/login', { replace: true })
  }

  return (
    <OnboardShell>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6, textAlign: 'center' }}>
        Connect to server
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 40, textAlign: 'center' }}>
        Enter your pilot server URL to get started.
      </p>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--rule)', borderRadius: 16, overflow: 'hidden' }}>
          <input
            type="url" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="http://localhost:3000" autoFocus
            style={{
              width: '100%', padding: '18px 20px', fontSize: 16,
              background: 'transparent', border: 'none', color: 'var(--ink)',
              outline: 'none', textAlign: 'center', letterSpacing: '-0.01em',
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            width: '100%', padding: '18px', fontSize: 16, fontWeight: 700,
            background: 'var(--ember)', border: 'none', borderRadius: 16, color: '#fff',
            boxShadow: '0 4px 20px rgba(255,107,53,0.3)', transition: 'opacity 120ms',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Connect →
        </button>

        {getServers().length > 0 && (
          <button
            type="button" onClick={() => navigate('/servers')}
            style={{
              fontSize: 13, color: 'var(--muted)', background: 'none',
              border: 'none', cursor: 'pointer', padding: '8px', transition: 'color 120ms',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--ink)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
          >
            ← Back to servers
          </button>
        )}
      </form>
    </OnboardShell>
  )
}
