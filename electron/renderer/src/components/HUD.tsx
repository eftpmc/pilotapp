import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getServerUrl } from '@/api'

export default function HUD() {
  const [time, setTime] = useState(() => new Date())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const server = getServerUrl().replace(/^https?:\/\//, '')

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: 'var(--hud-h)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px 0 88px',
      zIndex: 100,
      pointerEvents: 'none',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', color: 'var(--ink)', pointerEvents: 'none' }}>
        pilot
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)', pointerEvents: 'none' }}>{server}</span>

      <div ref={menuRef} style={{ position: 'relative', pointerEvents: 'auto' }}>
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: menuOpen ? 'var(--ink)' : 'var(--muted)',
            padding: '4px 8px', borderRadius: 6,
            background: menuOpen ? 'var(--card)' : 'none',
            transition: 'color 120ms, background 120ms',
          }}
        >
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
        </button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'var(--card)',
            border: '1px solid var(--rule)',
            borderRadius: 10, overflow: 'hidden',
            minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <button
              onClick={() => { setMenuOpen(false); navigate('/servers') }}
              style={menuItemStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Change server
            </button>
            <div style={{ height: 1, background: 'var(--rule)', margin: '2px 0' }} />
            <button
              onClick={signOut}
              style={{ ...menuItemStyle, color: 'var(--red)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '9px 14px', fontSize: 13, color: 'var(--ink)',
  background: 'transparent', border: 'none', cursor: 'pointer',
  transition: 'background 100ms',
}
