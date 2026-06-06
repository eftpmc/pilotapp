import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api/client'
import { Button } from '@/components/ui/button'

export default function AdminLoginPage() {
  const navigate   = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, role } = await auth.login(email, password)
      if (role !== 'admin') {
        setError('This account does not have admin access.')
        setLoading(false)
        return
      }
      localStorage.setItem('token', token)
      localStorage.setItem('pilot.role', role)
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>

      <div style={{ width: 380, padding: '0 24px' }}>
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
          <span style={{
            width: 22, height: 22, background: '#e5511a', borderRadius: 6,
            display: 'grid', placeItems: 'center',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, color: '#fff',
          }}>p</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
            pilot
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--muted)', border: '1px solid var(--rule)', borderRadius: 4,
            padding: '2px 5px', marginLeft: 2,
          }}>admin</span>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', margin: '0 0 4px', color: 'var(--ink)' }}>
          Admin sign in
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 28px' }}>
          Access restricted to administrators.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@company.com"
              required
              autoFocus
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
            />
          </div>

          {error && (
            <p style={{
              fontSize: 12.5, color: 'var(--red)', margin: 0,
              background: 'color-mix(in srgb, var(--red) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--red) 22%, transparent)',
              borderRadius: 8, padding: '9px 12px',
            }}>{error}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full justify-center mt-0.5 text-[14px] py-[11px]"
            disabled={loading}
          >
            {loading ? '…' : 'Sign in'}
          </Button>
        </form>

        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 24 }}>
          Not an admin?{' '}
          <a href="/login" style={{ color: 'var(--ember)', textDecoration: 'none' }}>
            Go to app login →
          </a>
        </p>
      </div>
    </div>
  )
}
