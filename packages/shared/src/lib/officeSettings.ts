export interface OfficeSettings {
  walkSpeed: number
  wanderSpeed: number
  bounds: number
  freeCamera: boolean
}

const DEFAULTS: OfficeSettings = { walkSpeed: 2.5, wanderSpeed: 1.8, bounds: 7, freeCamera: false }

export function getOfficeSettings(): OfficeSettings {
  try {
    const s = localStorage.getItem('pilot.office')
    if (s) return { ...DEFAULTS, ...JSON.parse(s) }
  } catch {}
  return { ...DEFAULTS }
}

export function saveOfficeSettings(patch: Partial<OfficeSettings>) {
  const next = { ...getOfficeSettings(), ...patch }
  localStorage.setItem('pilot.office', JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('pilot-office'))
}
