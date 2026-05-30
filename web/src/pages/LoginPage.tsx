import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export default function LoginPage() {
  const navigate  = useNavigate()
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
      const { token } = await fn(email, password)
      localStorage.setItem('token', token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-100" style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, var(--primary) 0%, transparent 65%)',
        opacity: 0.06,
      }} />

      <div className="relative w-full max-w-[360px] flex flex-col items-center gap-8">

        {/* Wordmark */}
        <div className="text-center">
          <h1 className="font-mono font-bold text-4xl tracking-tight text-foreground">pilot</h1>
          <p className="text-sm text-muted-foreground mt-2">AI coding agents, under your control</p>
        </div>

        {/* Card */}
        <div className="w-full bg-card border border-border/80 rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 60px rgba(0,0,0,0.5)' }}>

          {/* Mode tabs */}
          <div className="flex border-b border-border/60">
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                className={cn(
                  'flex-1 py-3 text-sm font-medium transition-colors cursor-pointer bg-transparent border-none capitalize',
                  mode === m
                    ? 'text-foreground border-b-2 border-primary -mb-px'
                    : 'text-muted-foreground hover:text-foreground'
                )}>
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3 p-6">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoFocus
              className="h-10 bg-muted/40 border-border/60 focus:border-primary/60"
            />
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={8}
              className="h-10 bg-muted/40 border-border/60 focus:border-primary/60"
            />

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="h-10 mt-1 font-semibold">
              {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>

        <p className="text-xs text-muted-foreground/50 text-center">
          Self-hosted · Your keys stay on your server
        </p>
      </div>
    </div>
  )
}
