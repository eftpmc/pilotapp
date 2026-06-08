import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveServerUrl, getServerUrl } from '@/api'

interface Server { url: string; label: string; addedAt: number }

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
  localStorage.setItem('pilot.servers', JSON.stringify(getServers().filter(s => s.url !== url)))
}

function initial(label: string): string {
  if (/^(localhost|127\.)/.test(label)) return 'L'
  return label.charAt(0).toUpperCase()
}

export default function ServersPage() {
  const navigate = useNavigate()
  const [servers, setServers] = useState<Server[]>(getServers)
  const [adding, setAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('http://localhost:3000')
  const activeUrl = getServerUrl()

  function pick(server: Server) {
    saveServerUrl(server.url)
    const updated = getServers().map(s => s.url === server.url ? { ...s, lastUsed: Date.now() } : s)
    localStorage.setItem('pilot.servers', JSON.stringify(updated))
    navigate(localStorage.getItem('token') ? '/office' : '/login', { replace: true })
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
    <div className="ob-shell">
      <div className="ob-block" style={{ maxWidth: 480 }}>
        <span className="ob-eyebrow">pilot</span>
        <h1 className="ob-heading">Servers</h1>

        <div className="srv-grid" style={{ width: '100%', marginTop: 8 }}>
          {servers.map(server => {
            const isActive = server.url === activeUrl
            return (
              <div
                key={server.url}
                className={`srv-tile${isActive ? ' active' : ''}`}
                onClick={() => pick(server)}
              >
                <button className="srv-del" onClick={e => del(e, server.url)} tabIndex={-1}>×</button>
                <div className="srv-orb">{initial(server.label)}</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span className="srv-name">{server.label}</span>
                  {isActive && <span className="srv-active-dot" />}
                </div>
              </div>
            )
          })}

          {adding ? (
            <form className="srv-add-form" onSubmit={submitNew} onClick={e => e.stopPropagation()}>
              <input autoFocus type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="http://…" />
              <button type="submit" className="srv-add-submit">Add</button>
              <button type="button" className="srv-add-cancel" onClick={() => setAdding(false)}>cancel</button>
            </form>
          ) : (
            <div className="srv-add" onClick={() => setAdding(true)}>
              <span style={{ fontSize: 24, fontWeight: 200, lineHeight: 1 }}>+</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>Add server</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
