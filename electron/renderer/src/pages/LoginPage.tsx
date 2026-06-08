import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@pilot/shared'
import OnboardShell from '@/components/OnboardShell'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

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
    <OnboardShell>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6, textAlign: 'center' }}>
        Sign in
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 40, textAlign: 'center' }}>
        Sign in to your pilot account.
      </p>

      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--rule)', borderRadius: 16, overflow: 'hidden' }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" autoFocus required
            style={{
              width: '100%', padding: '18px 20px', fontSize: 16,
              background: 'transparent', border: 'none',
              borderBottom: '1px solid var(--rule)',
              color: 'var(--ink)', outline: 'none', textAlign: 'center',
            }}
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required
            style={{
              width: '100%', padding: '18px 20px', fontSize: 16,
              background: 'transparent', border: 'none',
              color: 'var(--ink)', outline: 'none', textAlign: 'center',
            }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red)', textAlign: 'center', margin: '-2px 0' }}>{error}</p>
        )}

        <button
          type="submit" disabled={loading}
          style={{
            width: '100%', padding: '18px', fontSize: 16, fontWeight: 700,
            background: loading ? 'var(--elevated)' : 'var(--ember)',
            border: 'none', borderRadius: 16, color: '#fff',
            boxShadow: loading ? 'none' : '0 4px 20px rgba(255,107,53,0.3)',
            opacity: loading ? 0.7 : 1, transition: 'opacity 120ms, background 120ms',
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = loading ? '0.7' : '1' }}
        >
          {loading ? 'Signing in…' : 'Sign in →'}
        </button>

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
      </form>
    </OnboardShell>
  )
}
