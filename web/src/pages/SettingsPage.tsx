import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { connections, agents } from '../api/client'
import type { Connection, Agent, AgentProvider } from '../api/client'
import { useTheme, ACCENTS, type ThemeMode } from '../theme'

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { T } = useTheme()
  return (
    <div style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const { T } = useTheme()
  const colors: Record<string, { bg: string; text: string }> = {
    claude: { bg: '#F0820B20', text: '#F0820B' },
    codex:  { bg: '#0A84FF20', text: '#0A84FF' },
  }
  const c = colors[type] ?? { bg: T.surface, text: T.muted }
  return (
    <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: c.text, background: c.bg, borderRadius: 5, padding: '2px 7px' }}>
      {type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function AddConnectionModal({ onClose, onCreate, loading, error }: {
  onClose: () => void
  onCreate: (body: { name: string; type: AgentProvider; apiKey?: string; model?: string }) => void
  loading: boolean
  error?: string
}) {
  const { T } = useTheme()
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 11px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none' }
  const [name, setName]     = useState('')
  const [type, setType]     = useState<AgentProvider>('claude')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel]   = useState('')

  const modelPlaceholder = type === 'claude' ? 'claude-opus-4-7' : 'o4-mini'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 22px 18px', boxShadow: '0 30px 80px rgba(0,0,0,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>Add Connection</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Name</div>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="My Claude Key" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Type</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['claude', 'codex'] as AgentProvider[]).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                style={{
                  flex: 1, padding: '8px 0', fontFamily: T.sans, fontSize: 13, fontWeight: 600,
                  borderRadius: 9, cursor: 'pointer', border: `1px solid ${type === t ? T.tint : T.border}`,
                  background: type === t ? T.tint + '15' : 'transparent',
                  color: type === t ? T.tint : T.muted,
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
              API Key <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </div>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={type === 'claude' ? 'sk-ant-…' : 'sk-…'}
              style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Model <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
            <input value={model} onChange={e => setModel(e.target.value)}
              placeholder={modelPlaceholder}
              style={{ ...inputStyle, fontFamily: T.mono, fontSize: 12 }} />
          </div>
        </div>

        <div style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, marginBottom: 18, lineHeight: 1.5 }}>
          {apiKey
            ? 'Tasks will use this API key — billed per token on your developer dashboard.'
            : `No key — tasks will use ${type === 'claude' ? 'Claude Code OAuth (your claude.ai subscription)' : 'machine auth'} on this server.`}
        </div>

        {error && <p style={{ fontFamily: T.sans, fontSize: 13, color: T.danger, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onCreate({ name, type, apiKey: apiKey || undefined, model: model || undefined })} disabled={!name || loading}
            style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 10, padding: '10px 0', cursor: name && !loading ? 'pointer' : 'default', opacity: name && !loading ? 1 : 0.4 }}>
            {loading ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddAgentModal({ connectionList, onClose, onCreate, loading, error }: {
  connectionList: Connection[]
  onClose: () => void
  onCreate: (body: { name: string; connectionId: string }) => void
  loading: boolean
  error?: string
}) {
  const { T } = useTheme()
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: '9px 11px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none' }
  const [name, setName]                   = useState('')
  const [connectionId, setConnectionId]   = useState(connectionList[0]?.id ?? '')

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '20px 22px 18px', boxShadow: '0 30px 80px rgba(0,0,0,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontFamily: T.sans, fontSize: 17, fontWeight: 600, color: T.text }}>Add Agent</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Name</div>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Backend Claude" style={inputStyle} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.faint, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>Connection</div>
          {connectionList.length === 0 ? (
            <p style={{ fontFamily: T.sans, fontSize: 13, color: T.muted }}>No connections yet — add one first.</p>
          ) : (
            <select value={connectionId} onChange={e => setConnectionId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              {connectionList.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          )}
        </div>

        {error && <p style={{ fontFamily: T.sans, fontSize: 13, color: T.danger, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: '0 0 auto', fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onCreate({ name, connectionId })} disabled={!name || !connectionId || loading}
            style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 10, padding: '10px 0', cursor: (!name || !connectionId || loading) ? 'default' : 'pointer', opacity: (!name || !connectionId || loading) ? 0.4 : 1 }}>
            {loading ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grouped list helpers
// ---------------------------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  const { T } = useTheme()
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
      {children}
    </div>
  )
}

function Row({ children, isLast }: { children: React.ReactNode; isLast?: boolean }) {
  const { T } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: isLast ? 'none' : `1px solid ${T.border}` }}>
      {children}
    </div>
  )
}

function AuthBadge({ hasKey, type }: { hasKey: boolean; type: string }) {
  const { T } = useTheme()
  if (hasKey) return (
    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, padding: '1px 6px' }}>API key</span>
  )
  return (
    <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green, background: T.green + '15', border: `1px solid ${T.green}30`, borderRadius: 5, padding: '1px 6px' }}>
      {type === 'claude' ? 'subscription' : 'machine auth'}
    </span>
  )
}

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  const { T } = useTheme()
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setConfirming(false)} style={{ fontFamily: T.sans, fontSize: 11, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>Cancel</button>
        <button onClick={onDelete} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#fff', background: T.danger, border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>Delete</button>
      </div>
    )
  }
  return (
    <button onClick={() => setConfirming(true)} style={{ fontFamily: T.sans, fontSize: 11, color: T.faint, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer' }}>
      Delete
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { T, theme, accent, setTheme, setAccent } = useTheme()
  const qc = useQueryClient()
  const [showAddConnection, setShowAddConnection] = useState(false)
  const [showAddAgent, setShowAddAgent]           = useState(false)

  const { data: connectionList = [] } = useQuery({ queryKey: ['connections'], queryFn: () => connections.list() })
  const { data: agentList = [] }      = useQuery({ queryKey: ['agents'],      queryFn: () => agents.list() })

  const createConnection = useMutation({
    mutationFn: (body: Parameters<typeof connections.create>[0]) => connections.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); setShowAddConnection(false) },
  })

  const deleteConnection = useMutation({
    mutationFn: (id: string) => connections.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  })

  const createAgent = useMutation({
    mutationFn: (body: Parameters<typeof agents.create>[0]) => agents.create(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agents'] }); setShowAddAgent(false) },
  })

  const deleteAgent = useMutation({
    mutationFn: (id: string) => agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })

  function connectionFor(agent: Agent): Connection | undefined {
    return agent.connectionId ? connectionList.find(c => c.id === agent.connectionId) : undefined
  }

  function signOut() {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: T.bg }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 32 }}>

        <span style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: '-.02em' }}>Settings</span>

        {/* ------------------------------------------------------------------ */}
        {/* Connections                                                         */}
        {/* ------------------------------------------------------------------ */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <SectionTitle>Connections</SectionTitle>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowAddConnection(true)}
              style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
              + Add
            </button>
          </div>

          {connectionList.length === 0 ? (
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.muted, padding: '16px 0' }}>
              No connections yet. Add an API key to get started.
            </div>
          ) : (
            <Card>
              {connectionList.map((c, i) => (
                <Row key={c.id} isLast={i === connectionList.length - 1}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 500, color: T.text }}>{c.name}</span>
                  </div>
                  {c.model && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.faint }}>{c.model}</span>}
                  <AuthBadge hasKey={c.hasKey} type={c.type} />
                  <TypeBadge type={c.type} />
                  <DeleteBtn onDelete={() => deleteConnection.mutate(c.id)} />
                </Row>
              ))}
            </Card>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Agents                                                              */}
        {/* ------------------------------------------------------------------ */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <SectionTitle>Agents</SectionTitle>
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowAddAgent(true)} disabled={connectionList.length === 0}
              style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: '#fff', background: T.tint, border: 'none', borderRadius: 7, padding: '5px 12px', cursor: connectionList.length === 0 ? 'default' : 'pointer', opacity: connectionList.length === 0 ? 0.4 : 1 }}>
              + Add
            </button>
          </div>

          {agentList.length === 0 ? (
            <div style={{ fontFamily: T.sans, fontSize: 13, color: T.muted, padding: '16px 0' }}>
              No agents yet.{connectionList.length === 0 ? ' Add a connection first.' : ' Add an agent to dispatch tasks.'}
            </div>
          ) : (
            <Card>
              {agentList.map((a, i) => {
                const conn = connectionFor(a)
                return (
                  <Row key={a.id} isLast={i === agentList.length - 1}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 500, color: T.text }}>{a.name}</span>
                    </div>
                    {conn ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <TypeBadge type={conn.type} />
                        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.faint }}>{conn.name}{conn.model ? ` · ${conn.model}` : ''}</span>
                      </div>
                    ) : (
                      <TypeBadge type={a.provider} />
                    )}
                    <DeleteBtn onDelete={() => deleteAgent.mutate(a.id)} />
                  </Row>
                )
              })}
            </Card>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Appearance                                                          */}
        {/* ------------------------------------------------------------------ */}
        <section>
          <SectionTitle>Appearance</SectionTitle>
          <Card>
            <Row>
              <span style={{ fontFamily: T.sans, fontSize: 14, color: T.text, flex: 1 }}>Theme</span>
              <div style={{ display: 'flex', gap: 2, background: T.surface2, borderRadius: 8, padding: 2 }}>
                {(['light', 'system', 'dark'] as ThemeMode[]).map(t => (
                  <button key={t} onClick={() => setTheme(t)} style={{
                    fontFamily: T.sans, fontSize: 12, fontWeight: theme === t ? 600 : 500,
                    color: theme === t ? T.text : T.muted,
                    background: theme === t ? T.card : 'transparent',
                    border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                    boxShadow: theme === t ? '0 1px 2px rgba(0,0,0,.1)' : 'none',
                    textTransform: 'capitalize',
                  }}>{t}</button>
                ))}
              </div>
            </Row>
            <Row isLast>
              <span style={{ fontFamily: T.sans, fontSize: 14, color: T.text, flex: 1 }}>Accent color</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {ACCENTS.map(({ hex, label }) => (
                  <button key={hex} title={label} onClick={() => setAccent(hex)} style={{
                    width: 22, height: 22, borderRadius: '50%', background: hex, border: accent === hex ? `2px solid ${T.text}` : '2px solid transparent',
                    cursor: 'pointer', boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
                  }} />
                ))}
              </div>
            </Row>
          </Card>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Account                                                             */}
        {/* ------------------------------------------------------------------ */}
        <section>
          <SectionTitle>Account</SectionTitle>
          <button onClick={signOut}
            style={{ fontFamily: T.sans, fontSize: 13, color: T.danger, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Sign out
          </button>
        </section>

      </div>

      {showAddConnection && (
        <AddConnectionModal
          onClose={() => setShowAddConnection(false)}
          onCreate={body => createConnection.mutate(body)}
          loading={createConnection.isPending}
          error={createConnection.error?.message}
        />
      )}

      {showAddAgent && (
        <AddAgentModal
          connectionList={connectionList}
          onClose={() => setShowAddAgent(false)}
          onCreate={body => createAgent.mutate(body)}
          loading={createAgent.isPending}
          error={createAgent.error?.message}
        />
      )}
    </div>
  )
}
