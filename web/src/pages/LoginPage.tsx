import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api/client'
import { useTheme } from '../theme'

export default function LoginPage() {
  const { T } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState<'login' | 'register'>('login')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = mode === 'login' ? auth.login : auth.register
      const { token } = await fn(email, password)
      localStorage.setItem('token', token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 10, padding: '11px 14px',
    fontFamily: T.sans, fontSize: 14, color: T.text, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: T.sans }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <span style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 22, color: T.text, letterSpacing: '-0.02em' }}>pilot</span>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '24px 22px' }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email" required autoFocus style={inputStyle}
            />
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password" required minLength={8} style={inputStyle}
            />

            {error && (
              <p style={{ fontFamily: T.sans, fontSize: 13, color: T.danger, margin: 0 }}>{error}</p>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '11px 0', fontFamily: T.sans, fontSize: 14, fontWeight: 600,
              color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 10,
              cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, marginTop: 4,
            }}>
              {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <button
          onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
          style={{ marginTop: 16, width: '100%', background: 'transparent', border: 'none', fontFamily: T.sans, fontSize: 13, color: T.muted, cursor: 'pointer' }}
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
