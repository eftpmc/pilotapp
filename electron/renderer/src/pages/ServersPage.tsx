import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveServerUrl, getServerUrl } from '@/api'
import OnboardShell from '@/components/OnboardShell'

interface Server {
  url: string
  label: string
  addedAt: number
}

export function getServers(): Server[] {
  try { return JSON.parse(localStorage.getItem('pilot.servers') ?? '[]') } catch { return [] }
}

export function addServer(url: string) {
  const clean = url.replace(/\/$/, '')
  const servers = getServers().filter(s => s.url !== clean)
  const label = clean.replace(/^https?:\/\//, '')
  servers.unshift({ url: clean, label, addedAt: Date.now() })
  localStorage.setItem('pilot.servers', JSON.stringify(servers))
}

export function removeServer(url: string) {
  const servers = getServers().filter(s => s.url !== url)
  localStorage.setItem('pilot.servers', JSON.stringify(servers))
}

export default function ServersPage() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<Server[]>(getServers)
  const [adding, setAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('http://localhost:3000')
  const activeUrl = getServerUrl()

  function pick(server: Server) {
    saveServerUrl(server.url)
    // Touch lastUsed
    const updated = getServers().map(s =>
      s.url === server.url ? { ...s, lastUsed: Date.now() } : s
    )
    localStorage.setItem('pilot.servers', JSON.stringify(updated))
    const hasToken = !!localStorage.getItem('token')
    navigate(hasToken ? '/office' : '/login', { replace: true })
  }

  function submitNew(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newUrl.trim()
    if (!trimmed) return
    try { new URL(trimmed) } catch { return }
    addServer(trimmed)
    setServers(getServers())
    saveServerUrl(trimmed)
    setAdding(false)
    navigate('/login', { replace: true })
  }

  function del(e: React.MouseEvent, url: string) {
    e.stopPropagation()
    removeServer(url)
    setServers(getServers())
  }

  return (
    <OnboardShell>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 40, textAlign: 'center' }}>
        Choose a server
      </h1>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16,
        justifyContent: 'center', maxWidth: 600,
      }}>
        {servers.map(server => (
          <div
            key={server.url}
            onClick={() => pick(server)}
            style={{
              position: 'relative',
              width: 160, height: 160,
              borderRadius: 24,
              background: 'var(--card)',
              border: `2px solid ${server.url === activeUrl ? 'var(--ember)' : 'var(--rule)'}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'border-color 120ms, transform 100ms',
              padding: 20, gap: 12,
              boxShadow: server.url === activeUrl ? '0 0 0 1px rgba(255,107,53,0.2), 0 8px 24px rgba(255,107,53,0.12)' : 'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = server.url === activeUrl ? 'var(--ember)' : 'rgba(255,255,255,0.15)'
              e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = server.url === activeUrl ? 'var(--ember)' : 'var(--rule)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            {/* Remove button */}
            <button
              onClick={e => del(e, server.url)}
              style={{
                position: 'absolute', top: 10, right: 10,
                width: 22, height: 22, borderRadius: '50%',
                background: 'var(--elevated)', border: 'none',
                color: 'var(--muted)', fontSize: 14, lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', opacity: 0,
                transition: 'opacity 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
              ref={btn => {
                const card = btn?.closest('div') as HTMLElement
                if (!card) return
                card.addEventListener('mouseenter', () => { if (btn) btn.style.opacity = '1' })
                card.addEventListener('mouseleave', () => { if (btn) btn.style.opacity = '0' })
              }}
            >
              ×
            </button>

            {/* Server dot */}
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: server.url === activeUrl ? 'var(--ember)' : 'var(--elevated)',
              border: `1.5px solid ${server.url === activeUrl ? 'var(--ember)' : 'rgba(255,255,255,0.15)'}`,
            }} />

            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--ink)',
                wordBreak: 'break-all', lineHeight: 1.3,
              }}>
                {server.label}
              </div>
              {server.url === activeUrl && (
                <div style={{ fontSize: 11, color: 'var(--ember)', marginTop: 4, fontWeight: 600 }}>
                  Active
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add new server tile */}
        {adding ? (
          <form
            onSubmit={submitNew}
            style={{
              width: 160, height: 160, borderRadius: 24,
              background: 'var(--card)', border: '2px solid var(--ember)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: 16, gap: 8,
            }}
            onClick={e => e.stopPropagation()}
          >
            <input
              autoFocus
              type="url"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px',
                fontSize: 12, background: 'var(--elevated)',
                border: '1px solid var(--rule)', borderRadius: 8,
                color: 'var(--ink)', outline: 'none', textAlign: 'center',
              }}
            />
            <button type="submit" style={{
              width: '100%', padding: '8px',
              fontSize: 13, fontWeight: 700,
              background: 'var(--ember)', border: 'none',
              borderRadius: 10, color: '#fff',
            }}>
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} style={{
              fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer',
            }}>
              Cancel
            </button>
          </form>
        ) : (
          <div
            onClick={() => setAdding(true)}
            style={{
              width: 160, height: 160, borderRadius: 24,
              background: 'transparent',
              border: '2px dashed var(--rule)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: 10,
              transition: 'border-color 120ms, transform 100ms',
              color: 'var(--muted)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
              e.currentTarget.style.color = 'var(--ink)'
              e.currentTarget.style.transform = 'scale(1.03)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--rule)'
              e.currentTarget.style.color = 'var(--muted)'
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            <span style={{ fontSize: 32, lineHeight: 1, fontWeight: 200 }}>+</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Add server</span>
          </div>
        )}
      </div>
    </OnboardShell>
  )
}
