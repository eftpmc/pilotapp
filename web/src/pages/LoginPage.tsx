import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '@pilot/shared'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const navigate   = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [mode,     setMode]     = useState<'login' | 'register'>('login')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = mode === 'login' ? auth.login : auth.register
      const { token, role } = await fn(email, password)
      localStorage.setItem('token', token)
      localStorage.setItem('pilot.role', role)
      navigate(role === 'admin' ? '/admin' : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>

      {/* Left: brand panel — always warm/colorful regardless of system theme */}
      <div className="login-brand-panel" style={{
        flex: 1,
        minHeight: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        background: [
          'radial-gradient(ellipse 100% 70% at -5% -5%, #ff6b35 0%, transparent 52%)',
          'radial-gradient(ellipse 80% 65% at 105% 105%, #ffaa5c 0%, transparent 52%)',
          'radial-gradient(ellipse 70% 70% at 50% 50%, #ffe8d4 0%, transparent 65%)',
          '#fff4ec',
        ].join(', '),
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '48px 52px',
      }}>
        {/* Noise texture */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.025, pointerEvents: 'none',
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: '200px 200px',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 52 }}>
            <span style={{
              width: 24, height: 24, background: '#e5511a', borderRadius: 7,
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 800, color: '#fff',
            }}>p</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'rgba(40,20,10,0.45)' }}>pilot</span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 38, fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.025em',
            color: 'rgba(30,12,4,0.88)', margin: '0 0 16px', maxWidth: '13em',
          }}>
            AI coding agents,<br />under your control.
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(30,12,4,0.45)', lineHeight: 1.6, maxWidth: '28em', margin: 0 }}>
            Dispatch tasks to Claude and Codex agents. Review diffs, merge changes, ship faster.
          </p>
        </div>
      </div>

      {/* Right: form panel — follows system theme */}
      <div className="login-form-panel-wrap" style={{
        width: 420, flexShrink: 0,
        background: 'var(--bg)',
        borderLeft: '1px solid var(--rule)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '52px 48px',
      }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', margin: '0 0 6px', color: 'var(--ink)' }}>
          {mode === 'login' ? 'Welcome back' : 'Create an account'}
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 28px' }}>
          {mode === 'login' ? 'Sign in to your workspace' : 'Self-hosted · Your keys stay on your server'}
        </p>

        {/* Mode tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', marginBottom: 24 }}>
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              style={{
                flex: 1, padding: '10px', fontSize: 13.5,
                fontWeight: mode === m ? 600 : 500,
                color: mode === m ? 'var(--ink)' : 'var(--muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${mode === m ? 'var(--ember)' : 'transparent'}`,
                marginBottom: -1, transition: 'color .12s',
                fontFamily: 'inherit',
              }}
            >
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
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
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>

          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
            Self-hosted · Your keys stay on your server
          </p>
        </form>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .login-brand-panel { display: none !important; }
          .login-form-panel-wrap { width: 100% !important; border-left: none !important; padding: 40px 28px !important; }
        }
      `}</style>
    </div>
  )
}
