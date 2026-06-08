import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { connections, agents, me, cn, timeAgo, getOfficeSettings, saveOfficeSettings } from '@pilot/shared'
import type { Connection, AgentProvider, Agent, UserDevice, OfficeSettings } from '@pilot/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProviderBadge } from '@/components/ProviderBadge'

type ThemePref = 'light' | 'system' | 'dark'

function getStoredTheme(): ThemePref {
  const v = localStorage.getItem('pilot.theme')
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

function applyThemePref(t: ThemePref) {
  const resolved = t === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t
  if (t === 'system') localStorage.removeItem('pilot.theme')
  else localStorage.setItem('pilot.theme', t)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.classList.toggle('light', resolved === 'light')
  window.dispatchEvent(new CustomEvent('pilot-theme', { detail: resolved }))
}

function SectionHead({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
    </div>
  )
}

function SettingRow({ label, description, children, border = true }: {
  label: string; description?: string; children: React.ReactNode; border?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-4 px-4 py-3', border && 'border-b border-[var(--rule-soft)] last:border-0')}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
        {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SliderRow({ label, description, value, min, max, step, format, onChange }: {
  label: string; description?: string
  value: number; min: number; max: number; step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--rule-soft)] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--ink)]">{label}</p>
        {description && <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          className="w-28 accent-[var(--ember)]"
        />
        <span className="text-xs font-mono text-[var(--muted)] w-8 text-right tabular-nums">
          {format ? format(value) : value}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add Connection dialog
// ---------------------------------------------------------------------------

function AddConnectionDialog({ open, onClose, onCreate, loading, error }: {
  open: boolean; onClose: () => void
  onCreate: (body: { name: string; type: AgentProvider; apiKey?: string; model?: string }) => void
  loading: boolean; error?: string
}) {
  const [name, setName]     = useState('')
  const [type, setType]     = useState<AgentProvider>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel]   = useState('')

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Connection</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground -mt-1">
            A connection is an API credential agents use at runtime.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Anthropic · Pro" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <div className="flex gap-2">
              {(['claude', 'codex'] as AgentProvider[]).map(t => (
                <button key={t} type="button" onClick={() => setType(t)} className={cn(
                  'flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors cursor-pointer',
                  type === t ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                )}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>API Key <span className="opacity-60">(optional)</span></Label>
              <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={type === 'claude' ? 'sk-ant-…' : 'sk-…'} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Model <span className="opacity-60">(optional)</span></Label>
              <Input value={model} onChange={e => setModel(e.target.value)}
                placeholder={type === 'claude' ? 'claude-opus-4-7' : 'o4-mini'} className="font-mono text-xs" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {apiKey
              ? 'Tasks will use this API key — billed per token on your developer dashboard.'
              : `No key — tasks will use ${type === 'claude' ? 'Claude Code OAuth (your claude.ai subscription)' : 'machine auth'} on this server.`}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={!name || loading}
              onClick={() => onCreate({ name, type, apiKey: apiKey || undefined, model: model || undefined })}>
              {loading ? '…' : 'Add Connection'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Connection row
// ---------------------------------------------------------------------------

function ConnectionRow({ connection, agentCount, onUpdate, onDelete, onClearQuota }: {
  connection: Connection; agentCount: number
  onUpdate: (body: { name?: string; apiKey?: string; model?: string }) => void
  onDelete: () => void; onClearQuota: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name,   setName]   = useState(connection.name)
  const [model,  setModel]  = useState(connection.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (editing) {
    return (
      <div className="flex flex-col gap-3 px-4 py-3.5 bg-muted/30">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Model</Label>
            <Input value={model} onChange={e => setModel(e.target.value)} placeholder="default" className="h-8 text-xs font-mono" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">New API Key <span className="text-muted-foreground font-normal">(leave blank to keep existing)</span></Label>
          <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder={connection.hasKey ? '••••••••' : 'no key set'} className="h-8 text-xs font-mono" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(connection.name); setModel(connection.model ?? ''); setApiKey('') }}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { onUpdate({ name, model: model || undefined, apiKey: apiKey || undefined }); setEditing(false); setApiKey('') }}>
            Save
          </Button>
        </div>
      </div>
    )
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-destructive/5">
        <p className="text-xs text-muted-foreground flex-1">
          {agentCount > 0
            ? `This connection is used by ${agentCount} agent${agentCount !== 1 ? 's' : ''}. They will lose access.`
            : 'Delete this connection?'}
        </p>
        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
        <Button size="sm" variant="destructive" onClick={() => { onDelete(); setConfirmDelete(false) }}>Delete</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{connection.name}</span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
          {connection.model && <span className="font-mono text-[10px] text-muted-foreground">{connection.model}</span>}
          <Badge variant="outline" className={cn(
            'font-mono text-[10px]',
            connection.hasKey ? 'text-muted-foreground' : 'text-[var(--green)] border-[color-mix(in_srgb,var(--green)_30%,transparent)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]'
          )}>
            {connection.hasKey ? 'API key' : connection.type === 'claude' ? 'subscription' : 'machine auth'}
          </Badge>
          <ProviderBadge type={connection.type} />
        </div>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        {connection.model && <span className="font-mono text-[10px] text-muted-foreground">{connection.model}</span>}
        <Badge variant="outline" className={cn(
          'font-mono text-[10px]',
          connection.hasKey ? 'text-muted-foreground' : 'text-[var(--green)] border-[color-mix(in_srgb,var(--green)_30%,transparent)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]'
        )}>
          {connection.hasKey ? 'API key' : connection.type === 'claude' ? 'subscription' : 'machine auth'}
        </Badge>
        <ProviderBadge type={connection.type} />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {connection.quotaStatus === 'exceeded' && (
          <Button variant="ghost" size="sm" onClick={onClearQuota} className="p-0 h-auto hover:bg-transparent">
            <Badge variant="warning" className="text-[10px] gap-1 hover:opacity-80 transition-opacity">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber-dot)]" />
              Rate limited · clear
            </Badge>
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setEditing(true)}>Edit</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QR Pairing dialog
// ---------------------------------------------------------------------------

function PairingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const [error, setError]         = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [pairToken, setPairToken] = useState<string | null>(null)
  const [mobileUrl, setMobileUrl] = useState(window.location.origin)

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(mobileUrl)

  // Fetch a new pair token each time the dialog opens
  useEffect(() => {
    if (!open) return
    setError(null)
    setExpiresAt(null)
    setPairToken(null)
    setMobileUrl(window.location.origin)

    me.pairToken()
      .then(({ token, expiresAt: exp }) => {
        setExpiresAt(exp)
        setPairToken(token)
      })
      .catch(e => setError(e.message ?? 'Failed to generate pairing token'))
  }, [open])

  // Re-render QR whenever the token or the URL changes
  useEffect(() => {
    if (!pairToken || !canvasRef.current) return
    const payload = JSON.stringify({ serverUrl: mobileUrl, pairToken })
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 220,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' },
    }).catch(e => setError(String(e)))
  }, [pairToken, mobileUrl])

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Connect a device</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Server URL (reachable from phone)</Label>
            <Input
              value={mobileUrl}
              onChange={e => setMobileUrl(e.target.value)}
              placeholder="http://192.168.1.x:3000"
              className="font-mono text-xs"
            />
            {isLocalhost && (
              <p className="text-[11px] text-[var(--amber)]">
                Localhost isn't reachable from a phone. Replace with your machine's IP address, e.g. <span className="font-mono">http://192.168.1.100:3000</span>
              </p>
            )}
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-card/80 rounded-xl p-3 border border-border/60">
                <canvas ref={canvasRef} />
              </div>
              {expiresAt && (
                <p className="text-[11px] text-muted-foreground/50">
                  Expires {new Date(expiresAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Scan with the Pilot app. One-time use, 5-minute window.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Device row
// ---------------------------------------------------------------------------

function DeviceRow({ device, onRevoke }: { device: UserDevice; onRevoke: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const icon = device.deviceType === 'mobile' ? '📱' : device.deviceType === 'desktop' ? '💻' : '🌐'

  if (confirm) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-destructive/5">
        <p className="text-xs text-muted-foreground flex-1">Revoke access for {device.name}?</p>
        <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
        <Button size="sm" variant="destructive" onClick={() => { onRevoke(); setConfirm(false) }}>Revoke</Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-base shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm text-foreground truncate">{device.name}</span>
        <span className="text-xs text-muted-foreground">
          Added {timeAgo(device.createdAt)}
          {device.lastSeenAt && <> · Last seen {timeAgo(device.lastSeenAt)}</>}
        </span>
      </div>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => setConfirm(true)}>
        Revoke
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const [showAddConnection, setShowAddBrain]   = useState(false)
  const [showPairing,       setShowPairing]    = useState(false)
  const [confirmRevokeAll,  setConfirmRevokeAll] = useState(false)

  // Profile edit state
  const [editingProfile,   setEditingProfile]   = useState(false)
  const [profileName,      setProfileName]       = useState('')
  const [profileEmail,     setProfileEmail]      = useState('')
  const [changingPassword, setChangingPassword]  = useState(false)
  const [currentPassword,  setCurrentPassword]   = useState('')
  const [newPassword,      setNewPassword]       = useState('')
  const [confirmPassword,  setConfirmPassword]   = useState('')
  const [passwordError,    setPasswordError]     = useState('')

  // Appearance
  const [themePref, setThemePref] = useState<ThemePref>(getStoredTheme)

  // Office / camera settings
  const [office, setOffice] = useState<OfficeSettings>(getOfficeSettings)

  const { data: profile         } = useQuery({ queryKey: ['me'],           queryFn: () => me.profile() })
  const { data: deviceList = [] } = useQuery({ queryKey: ['me/devices'],   queryFn: () => me.devices() })
  const { data: connectionList = [] } = useQuery({ queryKey: ['connections'], queryFn: () => connections.list() })
  const { data: agentList      = [] } = useQuery({ queryKey: ['agents'],      queryFn: () => agents.list() })

  // Seed profile form when data loads
  const seededProfile = useRef<string | null>(null)
  if (profile && seededProfile.current !== profile.id) {
    setProfileName(profile.name)
    setProfileEmail(profile.email)
    seededProfile.current = profile.id
  }

  const createConnection = useMutation({
    mutationFn: (body: Parameters<typeof connections.create>[0]) => connections.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); setShowAddBrain(false) },
  })
  const updateConnection = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof connections.update>[1] }) => connections.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
  const deleteConnection = useMutation({
    mutationFn: (id: string) => connections.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
  const clearQuota = useMutation({
    mutationFn: (id: string) => connections.clearQuota(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })
  const updateProfile = useMutation({
    mutationFn: (body: Parameters<typeof me.update>[0]) => me.update(body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['me'] })
      setEditingProfile(false)
      setChangingPassword(false)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError('')
      if (data.token) {
        localStorage.setItem('token', data.token)
      }
    },
  })
  const revokeDevice = useMutation({
    mutationFn: (id: string) => me.revokeDevice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me/devices'] }),
  })
  const revokeAll = useMutation({
    mutationFn: () => me.revokeAll(),
    onSuccess: () => {
      localStorage.removeItem('token')
      navigate('/login')
    },
  })

  function changeTheme(t: ThemePref) {
    setThemePref(t)
    applyThemePref(t)
  }

  function updateOffice(patch: Partial<OfficeSettings>) {
    const next = { ...office, ...patch }
    setOffice(next)
    saveOfficeSettings(patch)
  }

  function agentCountForBrain(brainId: string): number {
    return (agentList as Agent[]).filter(e => e.connectionId === brainId).length
  }

  function signOut() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  function handleSavePassword() {
    setPasswordError('')
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return }
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return }
    updateProfile.mutate({ currentPassword, newPassword })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[680px] mx-auto px-6 pt-10 pb-12 flex flex-col gap-8">

        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

        {/* ── Account ── */}
        <section className="flex flex-col gap-3">
          <SectionHead label="Account" />
          <div className="card overflow-hidden">

            {!editingProfile ? (
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--rule-soft)]">
                <div className="w-8 h-8 rounded-full bg-[var(--ember-wash)] flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-[var(--ember)]">
                    {(profile?.name || profile?.email || '?')[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)] truncate">
                    {profile?.name || profile?.email || '—'}
                    {profile?.role === 'admin' && (
                      <span className="ml-2 text-[10px] font-semibold text-[var(--amber)] uppercase tracking-wide">Admin</span>
                    )}
                  </p>
                  {profile?.name && <p className="text-xs text-[var(--muted)] truncate">{profile.email}</p>}
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs shrink-0" onClick={() => setEditingProfile(true)}>
                  Edit
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 px-4 py-3.5 bg-[var(--panel-2)] border-b border-[var(--rule-soft)]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Display name</Label>
                    <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" className="h-8 text-xs" autoFocus />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Email</Label>
                    <Input value={profileEmail} onChange={e => setProfileEmail(e.target.value)} type="email" className="h-8 text-xs" />
                  </div>
                </div>
                {updateProfile.error && <p className="text-xs text-destructive">{updateProfile.error.message}</p>}
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setEditingProfile(false); setProfileName(profile?.name ?? ''); setProfileEmail(profile?.email ?? '') }}>Cancel</Button>
                  <Button size="sm" disabled={updateProfile.isPending} onClick={() => updateProfile.mutate({ name: profileName, email: profileEmail })}>Save</Button>
                </div>
              </div>
            )}

            {!changingPassword ? (
              <SettingRow label="Password">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-[var(--muted)] hover:text-[var(--ink)]" onClick={() => setChangingPassword(true)}>
                  Change
                </Button>
              </SettingRow>
            ) : (
              <div className="flex flex-col gap-3 px-4 py-3.5 bg-[var(--panel-2)] border-b border-[var(--rule-soft)]">
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Current</Label>
                    <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="h-8 text-xs" autoFocus />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">New</Label>
                    <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Confirm</Label>
                    <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-8 text-xs" onKeyDown={e => { if (e.key === 'Enter') handleSavePassword() }} />
                  </div>
                </div>
                {(passwordError || updateProfile.error) && <p className="text-xs text-destructive">{passwordError || updateProfile.error?.message}</p>}
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setChangingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError('') }}>Cancel</Button>
                  <Button size="sm" disabled={updateProfile.isPending} onClick={handleSavePassword}>{updateProfile.isPending ? '…' : 'Update'}</Button>
                </div>
              </div>
            )}

            <SettingRow label="Sign out" border={false}>
              <Button size="sm" variant="destructive" onClick={signOut}>Sign out</Button>
            </SettingRow>
          </div>
        </section>

        {/* ── Appearance ── */}
        <section className="flex flex-col gap-3">
          <SectionHead label="Appearance" />
          <div className="card overflow-hidden">
            <SettingRow label="Theme" description="Controls the interface and office lighting" border={false}>
              <div className="flex rounded-lg overflow-hidden border border-[var(--rule)]">
                {(['light', 'system', 'dark'] as ThemePref[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => changeTheme(t)}
                    className={cn(
                      'px-3 py-1.5 text-[11px] font-semibold capitalize border-r border-[var(--rule)] last:border-0 transition-colors',
                      themePref === t
                        ? 'bg-[var(--ember)] text-[var(--on-ember)]'
                        : 'bg-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-2)]'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>
        </section>

        {/* ── Office ── */}
        <section className="flex flex-col gap-3">
          <SectionHead label="Office" />
          <div className="card overflow-hidden">
            <SliderRow
              label="Walk speed"
              description="How fast agents walk between tasks"
              value={office.walkSpeed} min={0.5} max={6} step={0.1}
              format={v => v.toFixed(1)}
              onChange={v => updateOffice({ walkSpeed: v })}
            />
            <SliderRow
              label="Wander speed"
              description="How fast agents move while idle"
              value={office.wanderSpeed} min={0.3} max={4} step={0.1}
              format={v => v.toFixed(1)}
              onChange={v => updateOffice({ wanderSpeed: v })}
            />
            <SliderRow
              label="Wander radius"
              description="How far agents roam from center"
              value={office.bounds} min={2} max={9} step={0.5}
              format={v => v.toFixed(1)}
              onChange={v => updateOffice({ bounds: v })}
            />
            <SettingRow label="Camera" description="Free camera lets you orbit, zoom, and pan freely" border={false}>
              <div className="flex rounded-lg overflow-hidden border border-[var(--rule)]">
                {([false, true] as const).map(free => (
                  <button
                    key={String(free)}
                    type="button"
                    onClick={() => updateOffice({ freeCamera: free })}
                    className={cn(
                      'px-3 py-1.5 text-[11px] font-semibold border-r border-[var(--rule)] last:border-0 transition-colors',
                      office.freeCamera === free
                        ? 'bg-[var(--ember)] text-[var(--on-ember)]'
                        : 'bg-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-2)]'
                    )}
                  >
                    {free ? 'Free' : 'Guided'}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>
        </section>

        {/* ── Connections ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <SectionHead label="Connections" />
            <Button size="sm" className="shrink-0" onClick={() => setShowAddBrain(true)}>Add</Button>
          </div>
          <p className="text-xs text-[var(--muted)] -mt-1">API credentials agents use to run tasks.</p>
          {connectionList.length === 0 ? (
            <p className="text-sm text-[var(--faint)]">No connections yet.</p>
          ) : (
            <div className="card overflow-hidden">
              {connectionList.map((b, i) => (
                <div key={b.id} className={i > 0 ? 'border-t border-[var(--rule-soft)]' : ''}>
                  <ConnectionRow
                    connection={b}
                    agentCount={agentCountForBrain(b.id)}
                    onUpdate={body => updateConnection.mutate({ id: b.id, body })}
                    onDelete={() => deleteConnection.mutate(b.id)}
                    onClearQuota={() => clearQuota.mutate(b.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Devices ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <SectionHead label="Devices" />
            <div className="flex items-center gap-2 shrink-0">
              {deviceList.length > 0 && !confirmRevokeAll && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-[var(--muted)] hover:text-destructive"
                  onClick={() => setConfirmRevokeAll(true)}>
                  Sign out all
                </Button>
              )}
              {confirmRevokeAll && (
                <>
                  <span className="text-xs text-[var(--muted)]">Sign out everywhere?</span>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirmRevokeAll(false)}>Cancel</Button>
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => revokeAll.mutate()}>Confirm</Button>
                </>
              )}
              <Button size="sm" onClick={() => setShowPairing(true)}>Connect</Button>
            </div>
          </div>
          <p className="text-xs text-[var(--muted)] -mt-1">Mobile and desktop apps connected to this server.</p>
          <div className="card overflow-hidden">
            {deviceList.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-[var(--muted)]">No devices connected.</p>
                <p className="text-xs text-[var(--faint)] mt-1">Use the Pilot app and scan the QR code to pair.</p>
              </div>
            ) : (
              deviceList.map((device, i) => (
                <div key={device.id} className={i > 0 ? 'border-t border-[var(--rule-soft)]' : ''}>
                  <DeviceRow device={device} onRevoke={() => revokeDevice.mutate(device.id)} />
                </div>
              ))
            )}
          </div>
        </section>

      </div>

      <AddConnectionDialog
        open={showAddConnection}
        onClose={() => setShowAddBrain(false)}
        onCreate={body => createConnection.mutate(body)}
        loading={createConnection.isPending}
        error={createConnection.error?.message}
      />
      <PairingDialog open={showPairing} onClose={() => setShowPairing(false)} />
    </div>
  )
}
