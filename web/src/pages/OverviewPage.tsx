import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { sessions, tasks, employees, projects, events } from '../api/client'
import type { CompanyEvent } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { useElapsed, fmtSecs } from '@/lib/time'

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const EVENT_VERB: Record<string, [string, string]> = {
  'session.started':   ['started',  'var(--muted)'],
  'session.completed': ['finished', 'var(--green)'],
  'session.failed':    ['failed on','var(--red)'  ],
  'session.merged':    ['merged',   'var(--indigo)'],
}

function CaretIcon() {
  return <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
}

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const secs = useElapsed(createdAt, true)
  return <span className="row-time tnum">{fmtSecs(secs)}</span>
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
  const { data: employeeList = [] } = useQuery({ queryKey: ['employees'], queryFn: () => employees.list() })
  const { data: projectList  = [] } = useQuery({ queryKey: ['projects'],  queryFn: () => projects.list()  })
  const { data: eventList    = [] } = useQuery({ queryKey: ['events'],    queryFn: () => events.list(30),  refetchInterval: 30_000 })

  const codeSessions = sessionList.filter(s => !s.specId)
  const running      = codeSessions.filter(s => s.status === 'running')
  const review       = codeSessions.filter(s => s.status === 'done' || s.status === 'error')
  const queued       = taskList.filter(t => t.status === 'pending')

  function agentFor(id: string)    { return employeeList.find(e => e.id === id) }
  function projectName(id: string) { return projectList.find(p => p.id === id)?.name ?? 'Unknown' }
  function taskTitle(wid?: string) { return wid ? taskList.find(t => t.id === wid)?.title : undefined }

  const isEmpty = running.length === 0 && review.length === 0
  const date    = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  function toggleSection(id: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // lede sentence
  const lede = review.length > 0
    ? <><span className="num">{running.length}</span> agent{running.length !== 1 ? 's' : ''} working. <span className="num">{review.length}</span> {review.length === 1 ? 'change needs' : 'changes need'} your review, and <span className="num">{queued.length}</span> queued.</>
    : running.length > 0
    ? <><span className="num">{running.length}</span> agent{running.length !== 1 ? 's' : ''} working. Nothing needs review — <span className="num">{queued.length}</span> queued.</>
    : projectList.length === 0
    ? <>No projects yet. Add one to get started.</>
    : <>Nothing running. Open a project to dispatch work.</>

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      <div className="page-content narrow" style={{ paddingTop: 52, paddingBottom: 80 }}>

        {/* Header */}
        <div className="eyebrow" style={{ marginBottom: 14 }}>{date}</div>
        <h1 className="h-page">Today</h1>
        <p className="lede" style={{ marginTop: 20, maxWidth: '34em' }}>{lede}</p>

        {/* Onboarding steps */}
        {isEmpty && projectList.length === 0 && (
          <div className="section">
            <div className="rows">
              {[
                { n: '1', label: 'Add a project',  desc: 'Connect a GitHub repo or local path.',              path: '/projects'  },
                { n: '2', label: 'Add agents',      desc: 'Configure API keys and create named agents.',       path: '/employees' },
                { n: '3', label: 'Dispatch work',   desc: 'Open a project, create tasks, assign to agents.',  path: '/projects'  },
              ].map(({ n, label, desc, path }) => (
                <button key={n} className="row" onClick={() => navigate(path)} style={{ cursor: 'pointer' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', width: 18, flexShrink: 0 }}>{n}</span>
                  <div className="row-main">
                    <div className="row-title">{label}</div>
                    <div className="row-meta">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Waiting for review */}
        {review.length > 0 && (
          <div className={`section${collapsed.has('review') ? ' collapsed' : ''}`}>
            <div className="section-head">
              <button className="toggle" onClick={() => toggleSection('review')}>
                <CaretIcon />
                <h2>Waiting for you</h2>
                <span className="count">{review.length}</span>
              </button>
            </div>
            <div className="rows accent">
              {review.map(s => {
                const agent = agentFor(s.agentId)
                const title = taskTitle(s.workTaskId)
                const isError = s.status === 'error'
                return (
                  <button key={s.id} className="row" onClick={() => navigate(`/sessions/${s.id}`)}>
                    <AgentAvatar agent={agent} size={28} />
                    <div className="row-main">
                      <div className="row-title">{title ?? s.id.slice(0, 8)}</div>
                      <div className="row-meta">
                        <span>{agent?.name ?? '—'}</span>
                        <span className="sep">·</span>
                        <span>{projectName(s.projectId)}</span>
                        <span className="sep">·</span>
                        {isError
                          ? <span className="stat red"><span className="dot red" />Error</span>
                          : <span className="stat amber"><span className="dot amber" />Ready to review</span>
                        }
                      </div>
                    </div>
                    <span className="row-hint">↵</span>
                    <svg className="row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Running */}
        {running.length > 0 && (
          <div className={`section${collapsed.has('running') ? ' collapsed' : ''}`}>
            <div className="section-head">
              <button className="toggle" onClick={() => toggleSection('running')}>
                <CaretIcon />
                <h2>In progress</h2>
                <span className="count">{running.length}</span>
              </button>
            </div>
            <div className="rows">
              {running.map(s => {
                const agent = agentFor(s.agentId)
                const title = taskTitle(s.workTaskId)
                return (
                  <button key={s.id} className="row quiet" onClick={() => navigate(`/sessions/${s.id}`)}>
                    <span className="dot green pulse" />
                    <AgentAvatar agent={agent} size={26} running />
                    <div className="row-main">
                      <div className="row-title">{title ?? s.id.slice(0, 8)}</div>
                      <div className="row-meta">
                        <span>{agent?.name ?? '—'}</span>
                        <span className="sep">·</span>
                        <span>{projectName(s.projectId)}</span>
                      </div>
                    </div>
                    <ElapsedTimer createdAt={s.createdAt} />
                    <span className="row-hint">↵</span>
                    <svg className="row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Activity */}
        {eventList.length > 0 && (
          <div className={`section${collapsed.has('activity') ? ' collapsed' : ''}`}>
            <div className="section-head">
              <button className="toggle" onClick={() => toggleSection('activity')}>
                <CaretIcon />
                <h2>Activity</h2>
              </button>
            </div>
            <div className="feed">
              {(eventList as CompanyEvent[]).slice(0, 12).map(ev => {
                const [verb, color] = EVENT_VERB[ev.type] ?? ['updated', 'var(--muted)']
                return (
                  <button
                    key={ev.id}
                    className="feedrow"
                    onClick={() => ev.sessionId && navigate(`/sessions/${ev.sessionId}`)}
                    disabled={!ev.sessionId}
                  >
                    <span className="who">{ev.data.employeeName ?? '—'}</span>
                    <span className="verb" style={{ color }}>{verb}</span>
                    <span className="what">{ev.data.taskTitle ?? ''}</span>
                    <span className="when">{timeAgo(ev.createdAt)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
