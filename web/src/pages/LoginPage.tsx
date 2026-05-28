import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth } from '../api/client'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-white mb-8 text-center">Pilot</h1>

        <form onSubmit={submit} className="space-y-4">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required autoFocus
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password (8+ chars)" required minLength={8}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30 transition-colors"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit" disabled={loading}
            className="w-full bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-semibold rounded-lg py-3 text-sm transition-colors"
          >
            {loading ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => setMode(m => m === 'login' ? 'register' : 'login')}
          className="mt-4 w-full text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
