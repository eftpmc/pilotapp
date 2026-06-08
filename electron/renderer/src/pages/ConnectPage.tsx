import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { saveServerUrl } from '@/api'
import { addServer, getServers } from '@/pages/ServersPage'

export default function ConnectPage() {
  const [url, setUrl] = useState('http://localhost:3000')
  const navigate = useNavigate()

  let validUrl = ''
  try { validUrl = new URL(url.trim()).href } catch {}

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!validUrl) return
    addServer(url.trim())
    saveServerUrl(url.trim())
    navigate('/login', { replace: true })
  }

  function quickConnect() {
    if (!validUrl) return
    addServer(url.trim())
    saveServerUrl(url.trim())
    window.electron?.openExternal?.(url.trim().replace(/\/$/, '') + '/settings')
  }

  return (
    <div className="ob-shell">
      <div className="ob-block">
        <span className="ob-eyebrow">pilot</span>
        <h1 className="ob-heading">Connect</h1>

        <form className="ob-form" onSubmit={submit}>
          <div className="ob-fields">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="http://localhost:3000 or https://…"
              autoFocus
              className="ob-input"
              style={{ textAlign: 'center' }}
            />
          </div>
          <button type="submit" className="ob-btn">Continue →</button>
        </form>

        {validUrl && (
          <button className="ob-quick" onClick={quickConnect}>
            Quick connect via browser
          </button>
        )}

        {getServers().length > 0 && (
          <button className="ob-back" onClick={() => navigate('/servers')}>
            ← saved servers
          </button>
        )}
      </div>
    </div>
  )
}
