import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, projects } from '../api/client'
import { useTheme } from '../theme'

interface Line { text: string; kind: 'text' | 'tool' | 'stderr' }

function formatToolCall(name: string, input: Record<string, unknown>): string {
  const entries = Object.entries(input)
  if (entries.length === 0) return `▸ ${name}`
  if (entries.length === 1) {
    const v = String(entries[0][1])
    const short = v.length > 70 ? '…' + v.slice(-60) : v
    return `▸ ${name}  ${short}`
  }
  const parts = entries.slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 35)}`)
  return `▸ ${name}  ${parts.join('  ')}`
}

export default function SessionPage() {
  const { T } = useTheme()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [lines, setLines] = useState<Line[]>([])
  const [done, setDone] = useState(false)
  const [tab, setTab] = useState<'output' | 'diff'>('output')
  const [diff, setDiff] = useState('')
  const [hint, setHint]     = useState('')
  const [merged, setMerged] = useState(false)
  const [pushed, setPushed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const lineBufferRef = useRef('')

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessions.list().then(list => list.find(s => s.id === id)),
    enabled: !!id,
    refetchInterval: 3000,
  })
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })

  const agent   = agentList.find(a => a.id === session?.agentId)
  const project = projectList.find(p => p.id === session?.projectId)

  const merge = useMutation({
    mutationFn: () => sessions.merge(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); setMerged(true) },
  })
  const push = useMutation({
    mutationFn: () => projects.push(project!.id),
    onSuccess: () => setPushed(true),
  })
  const discard = useMutation({
    mutationFn: () => sessions.delete(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); navigate(-1) },
  })
  const retry = useMutation({
    mutationFn: (prompt?: string) => sessions.run(id!, prompt),
    onSuccess: () => {
      setLines([])
      setDone(false)
      setHint('')
      lineBufferRef.current = ''
      refetchSession()
    },
  })

  // WebSocket for live output
  useEffect(() => {
    if (!id) return
    const token = localStorage.getItem('token')
    if (!token) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'done') { setDone(true); refetchSession(); return }
      if (msg.type === 'stdout') processChunk(msg.data)
      if (msg.type === 'stderr') addLine(msg.data, 'stderr')
    }
    return () => ws.close()
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  function addLine(text: string, kind: Line['kind']) {
    setLines(prev => [...prev, { text, kind }])
  }

  function processChunk(chunk: string) {
    lineBufferRef.current += chunk
    const parts = lineBufferRef.current.split('\n')
    lineBufferRef.current = parts.pop() ?? ''
    for (const line of parts) {
      processStreamLine(line.trim())
    }
  }

  function processStreamLine(line: string) {
    if (!line) return
    try {
      const obj = JSON.parse(line)
      if (obj.type === 'assistant') {
        for (const block of (obj.message?.content ?? [])) {
          if (block.type === 'text' && block.text?.trim()) {
            addLine(block.text.trim(), 'text')
          } else if (block.type === 'tool_use') {
            addLine(formatToolCall(block.name, block.input ?? {}), 'tool')
          }
          // skip thinking blocks
        }
      } else if (obj.type === 'result') {
        if (obj.result?.trim()) addLine(obj.result.trim(), 'text')
      }
      // skip user (tool results), system, and other internal events
    } catch {
      // Plain text — Codex output or unparseable lines
      if (line) addLine(line, 'text')
    }
  }

  async function loadDiff() {
    if (!id) return
    const { diff: d } = await sessions.diff(id)
    setDiff(d)
  }

  const lineColor = (kind: Line['kind']) => {
    if (kind === 'stderr') return T.faint
    if (kind === 'tool')   return T.tint
    return T.text
  }

  const tabBtn = (t: 'output' | 'diff'): React.CSSProperties => ({
    fontFamily: T.sans, fontSize: 12, fontWeight: 600, background: 'transparent', border: 'none',
    borderBottom: `2px solid ${tab === t ? T.tint : 'transparent'}`,
    color: tab === t ? T.text : T.muted, padding: '8px 14px', cursor: 'pointer',
  })

  const btn = (primary?: boolean, danger?: boolean): React.CSSProperties => ({
    fontFamily: T.sans, fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '6px 14px',
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
    ...(primary  ? { background: T.tint,    color: '#FFFFFF',  border: 'none' } :
        danger   ? { background: 'transparent', color: T.danger, border: `1px solid ${T.danger}44` } :
                   { background: 'transparent', color: T.muted,  border: `1px solid ${T.border}` }),
  })

  const isError = session?.status === 'error'
  const isDone  = session?.status === 'done'
  const isRunning = session?.status === 'running' || session?.status === 'idle'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, fontFamily: T.sans, color: T.text }}>

      {/* header */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: T.card }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', fontFamily: T.sans, fontSize: 13, color: T.muted, cursor: 'pointer', padding: 0 }}>← Back</button>
        <div style={{ width: 1, height: 16, background: T.border }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {agent   && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{agent.name}</span>}
          {project && <span style={{ fontSize: 13, color: T.muted }}>· {project.name}</span>}
          {session && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.faint }}>{session.branch}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isDone && <button onClick={() => { setTab('diff'); loadDiff() }} style={btn()}>View diff</button>}
          {isDone && <button onClick={() => merge.mutate()} disabled={merge.isPending} style={btn(true)}>{merge.isPending ? '…' : 'Merge ✓'}</button>}
          <button onClick={() => discard.mutate()} disabled={discard.isPending} style={btn(false, true)}>{discard.isPending ? '…' : 'Discard'}</button>
        </div>
      </div>

      {/* tab bar */}
      {diff && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, padding: '0 20px', background: T.card, flexShrink: 0 }}>
          <button style={tabBtn('output')} onClick={() => setTab('output')}>Output</button>
          <button style={tabBtn('diff')}   onClick={() => setTab('diff')}>Diff</button>
        </div>
      )}

      {/* output */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {tab === 'output' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {lines.map((line, i) => (
              <div key={i} style={{ fontFamily: T.mono, fontSize: 12, lineHeight: 1.65, color: lineColor(line.kind), whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: line.kind === 'stderr' ? 0.5 : 1 }}>
                {line.text}
              </div>
            ))}
            {isRunning && !done && (
              <div style={{ display: 'inline-block', width: 7, height: 13, background: T.green, animation: 'blink 1s steps(1) infinite', marginTop: 4 }} />
            )}
            {done && <div style={{ fontFamily: T.mono, fontSize: 11, color: T.faint, marginTop: 8 }}>── finished ──</div>}
            {lines.length === 0 && !isRunning && !done && (
              <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint }}>No output yet.</div>
            )}
            <div ref={bottomRef} />
          </div>
        ) : (
          <pre style={{ fontFamily: T.mono, fontSize: 12, color: T.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
            {diff || 'No changes'}
          </pre>
        )}
      </div>

      {/* post-merge panel */}
      {merged && (
        <div style={{ borderTop: `1px solid ${T.green}44`, padding: '14px 20px', background: T.green + '08', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.green }}>Merged ✓</span>
            <div style={{ flex: 1 }} />
            {project?.remoteUrl && !pushed && (
              <button onClick={() => push.mutate()} disabled={push.isPending}
                style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                {push.isPending ? '…' : 'Push to remote'}
              </button>
            )}
            {project?.remoteUrl && pushed && (
              <span style={{ fontFamily: T.sans, fontSize: 12, color: T.tint, fontWeight: 600 }}>Pushed ✓</span>
            )}
            {project?.localPath && (
              <CopyCommand text={`git -C ${project.localPath} pull ${project.repoPath} main`} />
            )}
            {push.isError && (
              <span style={{ fontFamily: T.sans, fontSize: 12, color: T.danger }}>{push.error?.message}</span>
            )}
            <button onClick={() => navigate(-1)}
              style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.muted, background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* error nudge */}
      {isError && (
        <div style={{ borderTop: `1px solid ${T.danger}33`, padding: '14px 20px', background: T.danger + '08', flexShrink: 0 }}>
          <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.danger, marginBottom: 10 }}>
            Session ended with an error
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={hint}
              onChange={e => setHint(e.target.value)}
              placeholder="Optional: add context or guidance before retrying…"
              rows={2}
              style={{ flex: 1, fontFamily: T.sans, fontSize: 13, color: T.text, background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, padding: '8px 11px', outline: 'none', resize: 'none', lineHeight: 1.5 }}
            />
            <button
              onClick={() => {
                const basePrompt = lines.length > 0 ? undefined : undefined
                void basePrompt
                retry.mutate(hint.trim() ? `Continue where you left off.\n\nAdditional context: ${hint.trim()}` : undefined)
              }}
              disabled={retry.isPending}
              style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: T.tint, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {retry.isPending ? '…' : 'Retry'}
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}

function CopyCommand({ text }: { text: string }) {
  const { T } = useTheme()
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} title="Copy pull command"
      style={{ fontFamily: T.mono, fontSize: 11, color: T.tint, background: T.tint + '12', border: `1px solid ${T.tint}30`, borderRadius: 7, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {copied ? 'Copied ✓' : `Copy pull command`}
    </button>
  )
}
