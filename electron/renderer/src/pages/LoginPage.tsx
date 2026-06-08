import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@pilot/shared'
import { getServerUrl } from '@/api'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const serverUrl = getServerUrl()
  const server = serverUrl.replace(/^https?:\/\//, '')

  function quickConnect() {
    window.electron?.openExternal?.(serverUrl.replace(/\/$/, '') + '/settings')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await auth.login(email, password)
      localStorage.setItem('token', res.token)
      navigate('/office', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ob-shell">
      <div className="ob-block">
        {server && <span className="ob-eyebrow">{server}</span>}
        <h1 className="ob-heading">Sign in</h1>

        <form className="ob-form" onSubmit={submit}>
          <div className="ob-fields">
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email" autoFocus required
              className="ob-input"
            />
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password" required
              className="ob-input"
            />
          </div>
          {error && <p className="ob-error">{error}</p>}
          <button type="submit" disabled={loading} className="ob-btn">
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <button className="ob-quick" onClick={quickConnect}>
          Quick connect via browser
        </button>

        <button className="ob-back" onClick={() => navigate('/servers')}>
          ← change server
        </button>
      </div>
    </div>
  )
}
