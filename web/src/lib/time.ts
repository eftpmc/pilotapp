import { useState, useEffect } from 'react'

export function fmtSecs(s: number): string {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export function useElapsed(startIso?: string, active = true): number {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    if (!active || !startIso) return
    const start = new Date(startIso).getTime()
    const tick = () => setSecs(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active, startIso])
  return secs
}
