import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessions, agents, projects } from '../api/client'

interface Line { text: string; kind: 'assistant' | 'tool' | 'system' | 'stderr' }

export default function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [lines, setLines] = useState<Line[]>([])
  const [done, setDone] = useState(false)
  const [tab, setTab] = useState<'output' | 'diff'>('output')
  const [diff, setDiff] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { data: session } = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessions.list().then(list => list.find(s => s.id === id)),
    enabled: !!id,
  })
  const { data: agentList = [] }   = useQuery({ queryKey: ['agents'],   queryFn: () => agents.list() })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'], queryFn: () => projects.list() })

  const agent   = agentList.find(a => a.id === session?.agentId)
  const project = projectList.find(p => p.id === session?.projectId)

  const merge = useMutation({
    mutationFn: () => sessions.merge(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); navigate('/work') },
  })

  const discard = useMutation({
    mutationFn: () => sessions.delete(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions'] }); navigate('/work') },
  })

  // Connect WebSocket
  useEffect(() => {
    if (!id) return
    const token = localStorage.getItem('token')
    if (!token) return

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: id }))
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'done') { setDone(true); return }
      if (msg.type === 'stdout') { parseLine(msg.data) }
      if (msg.type === 'stderr') {
        setLines(prev => [...prev, { text: msg.data, kind: 'stderr' }])
      }
    }

    return () => ws.close()
  }, [id])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  function parseLine(raw: string) {
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const obj = JSON.parse(trimmed)
        if (obj.type === 'assistant') {
          for (const block of obj.message?.content ?? []) {
            if (block.type === 'text') setLines(prev => [...prev, { text: block.text, kind: 'assistant' }])
          }
        } else if (obj.type === 'tool_use' && obj.subtype === 'pre_tool_use') {
          const summary = Object.entries(obj.input ?? {}).map(([k, v]) => `${k}: ${v}`).join(', ')
          setLines(prev => [...prev, { text: `▸ ${obj.name}(${summary})`, kind: 'tool' }])
        } else if (obj.type === 'result') {
          if (obj.result) setLines(prev => [...prev, { text: obj.result, kind: 'assistant' }])
        }
      } catch {
        setLines(prev => [...prev, { text: trimmed, kind: 'assistant' }])
      }
    }
  }

  async function loadDiff() {
    if (!id) return
    const { diff: d } = await sessions.diff(id)
    setDiff(d)
  }

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col">
      {/* Session header */}
      <div className="border-b border-white/8 px-6 py-3 flex items-center gap-4 shrink-0">
        <button onClick={() => navigate('/work')} className="text-white/40 hover:text-white text-sm transition-colors">← Back</button>
        <div className="flex-1 min-w-0">
          {agent && <span className="text-sm font-medium text-white">{agent.name}</span>}
          {project && <span className="text-sm text-white/40"> · {project.name}</span>}
          {session && <span className="ml-2 text-xs font-mono text-white/25">{session.branch}</span>}
        </div>
        {session?.status === 'done' && (
          <div className="flex gap-2">
            <button
              onClick={() => { setTab('diff'); loadDiff() }}
              className="px-3 py-1.5 text-xs border border-white/15 text-white/60 rounded-lg hover:bg-white/5 transition-colors">
              View diff
            </button>
            <button onClick={() => merge.mutate()} disabled={merge.isPending}
              className="px-3 py-1.5 text-xs bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-semibold rounded-lg transition-colors">
              {merge.isPending ? '…' : 'Merge'}
            </button>
          </div>
        )}
        <button onClick={() => discard.mutate()} disabled={discard.isPending}
          className="px-3 py-1.5 text-xs text-red-400/70 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 rounded-lg transition-colors">
          {discard.isPending ? '…' : 'Discard'}
        </button>
      </div>

      {/* Tab bar (only shows when diff is available) */}
      {diff && (
        <div className="flex border-b border-white/8 px-6 shrink-0">
          {(['output', 'diff'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors ${
                tab === t ? 'border-[#22c55e] text-white' : 'border-transparent text-white/40 hover:text-white/70'
              }`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'output' ? (
          <div className="p-6 space-y-1 font-mono text-sm">
            {lines.map((line, i) => (
              <div key={i} className={
                line.kind === 'stderr'    ? 'text-white/30' :
                line.kind === 'tool'      ? 'text-blue-400/80' :
                line.kind === 'system'    ? 'text-white/20 italic' :
                                            'text-white/85'
              }>
                {line.text}
              </div>
            ))}
            {!done && session?.status === 'running' && (
              <div className="flex gap-1 pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
              </div>
            )}
            {done && <div className="text-white/20 italic mt-2">── finished ──</div>}
            <div ref={bottomRef} />
          </div>
        ) : (
          <pre className="p-6 text-xs font-mono text-white/70 overflow-auto whitespace-pre-wrap">
            {diff || 'No changes'}
          </pre>
        )}
      </div>
    </div>
  )
}
