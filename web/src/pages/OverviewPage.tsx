import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { sessions, tasks, agents, projects, events } from '../api/client'
import type { CompanyEvent } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { useElapsed, fmtSecs } from '@/lib/time'
import { cn } from '@/lib/utils'

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const EVENT_VERB: Record<string, [string, string]> = {
  'session.started':   ['started',   'text-muted-foreground'],
  'session.completed': ['finished',  'text-green-500'],
  'session.failed':    ['failed on', 'text-destructive'],
  'session.merged':    ['merged',    'text-primary'],
}

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">{fmtSecs(secs)}</span>
}

export default function OverviewPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    let ws: WebSocket | null = null
    let dead = false
    let delay = 1000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
      ws.onopen = () => { delay = 1000; ws!.send(JSON.stringify({ type: 'subscribe-global' })) }
      ws.onmessage = (e) => {
        try {
          if (JSON.parse(e.data).type === 'global-event') {
            qc.invalidateQueries({ queryKey: ['sessions'] })
            qc.invalidateQueries({ queryKey: ['tasks'] })
            qc.invalidateQueries({ queryKey: ['events'] })
          }
        } catch {}
      }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror  = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [qc])

  const { data: sessionList  = [] } = useQuery({ queryKey: ['sessions'],  queryFn: () => sessions.list(),  refetchInterval: 30_000 })
  const { data: taskList     = [] } = useQuery({ queryKey: ['tasks'],     queryFn: () => tasks.list(),     refetchInterval: 30_000 })
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })
  const { data: projectList  = [] } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list()  })
  const { data: eventList    = [] } = useQuery({ queryKey: ['events'],    queryFn: () => events.list(30),  refetchInterval: 30_000 })

  const codeSessions = sessionList.filter(s => !s.specId)
  const running      = codeSessions.filter(s => s.status === 'running')
  const review       = codeSessions.filter(s => s.status === 'done' || s.status === 'error')
  const queued       = taskList.filter(t => t.status === 'pending')

  function agentFor(id: string)    { return agentList.find(e => e.id === id) }
  function projectName(id: string) { return projectList.find(p => p.id === id)?.name ?? 'Unknown' }
  function taskTitle(wid?: string) { return wid ? taskList.find(t => t.id === wid)?.title : undefined }

  const parts: string[] = []
  if (running.length) parts.push(`${running.length} agent${running.length !== 1 ? 's' : ''} working`)
  if (review.length)  parts.push(`${review.length} to review`)
  if (queued.length)  parts.push(`${queued.length} queued`)
  const subtitle = parts.length ? parts.join(' · ') : 'Nothing running yet.'

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggle(id: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="px-6 pt-10 pb-8 flex flex-col gap-8">

        {/* Header — same pattern as Knowledge / Tools */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>

        {/* Empty onboarding */}
        {running.length === 0 && review.length === 0 && projectList.length === 0 && (
          <section className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground/50 mb-1">Get started</p>
            {[
              { n: '1', label: 'Add a project',  desc: 'Connect a GitHub repo or local path.', path: '/projects'  },
              { n: '2', label: 'Add agents',      desc: 'Configure API keys and create named agents.', path: '/agents' },
              { n: '3', label: 'Dispatch work',   desc: 'Open a project, create tasks, assign to agents.', path: '/projects' },
            ].map(({ n, label, desc, path }) => (
              <button
                key={n}
                onClick={() => navigate(path)}
                className="flex items-start gap-4 px-4 py-3.5 bg-card border border-border rounded-xl text-left hover:bg-muted/50 transition-colors w-full"
              >
                <span className="w-5 h-5 rounded-md bg-primary/10 text-primary text-[11px] font-bold grid place-items-center shrink-0 mt-0.5">{n}</span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </section>
        )}

        {/* Needs review */}
        {review.length > 0 && (
          <section>
            <button className="flex items-center gap-2 mb-3 group" onClick={() => toggle('review')} aria-expanded={!collapsed.has('review')}>
              <p className="text-xs font-medium text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                Needs review
              </p>
              <span className="count">{review.length}</span>
            </button>
            {!collapsed.has('review') && (
              <div className="flex flex-col gap-2">
                {review.map(s => {
                  const agent = agentFor(s.agentId)
                  const title = taskTitle(s.workTaskId)
                  const isError = s.status === 'error'
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/sessions/${s.id}`)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3.5 bg-card border rounded-xl hover:bg-muted/50 transition-colors text-left w-full [box-shadow:var(--shadow-sm)]',
                        isError ? 'border-destructive/25' : 'border-amber-500/25'
                      )}
                    >
                      <AgentAvatar agent={agent} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{title ?? s.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{agent?.name ?? '—'} · {projectName(s.projectId)}</p>
                      </div>
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold shrink-0',
                        isError ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-amber-500/25 bg-amber-500/10 text-amber-500'
                      )}>
                        <span className={cn('dot', isError ? 'red' : 'amber')} />
                        {isError ? 'Error' : 'Ready'}
                      </span>
                      <svg className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Running */}
        {running.length > 0 && (
          <section>
            <button className="flex items-center gap-2 mb-3 group" onClick={() => toggle('running')}>
              <p className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                In progress · {running.length}
              </p>
            </button>
            {!collapsed.has('running') && (
              <div className="flex flex-col gap-2">
                {running.map(s => {
                  const agent = agentFor(s.agentId)
                  const title = taskTitle(s.workTaskId)
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate(`/sessions/${s.id}`)}
                      className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors text-left w-full"
                    >
                      <span className="dot green pulse shrink-0" />
                      <AgentAvatar agent={agent} size={34} running />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{title ?? s.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{agent?.name ?? '—'} · {projectName(s.projectId)}</p>
                      </div>
                      <ElapsedTimer createdAt={s.createdAt} />
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* Activity */}
        {eventList.length > 0 && (
          <section>
            <p className="text-xs font-medium text-muted-foreground/60 mb-3">Activity</p>
            <div className="flex flex-col">
              {(eventList as CompanyEvent[]).slice(0, 12).map(ev => {
                const name = ev.data.employeeName ?? ''
                const [verb, colorClass] = EVENT_VERB[ev.type] ?? ['updated', 'text-muted-foreground']
                return (
                  <button
                    key={ev.id}
                    onClick={() => ev.sessionId && navigate(`/sessions/${ev.sessionId}`)}
                    disabled={!ev.sessionId}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-muted/40 transition-colors text-left w-full disabled:cursor-default"
                  >
                    <span className="w-[52px] shrink-0 text-xs font-semibold truncate text-foreground">{name || '—'}</span>
                    <span className={cn('w-[60px] shrink-0 text-xs', colorClass)}>{verb}</span>
                    <span className="flex-1 min-w-0 text-xs text-muted-foreground truncate">{ev.data.taskTitle ?? ''}</span>
                    <span className="text-xs text-muted-foreground/40 shrink-0 tabular-nums">{timeAgo(ev.createdAt)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
