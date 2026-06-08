import { useQuery } from '@tanstack/react-query'
import { agents, sessions } from '@/api'
import AgentCard from '@/components/AgentCard'
import type { Agent, Session } from '@/api'
import { UserPlus } from 'lucide-react'

function Skeleton() {
  return <div className="skeleton" style={{ width: '100%', height: 72, borderRadius: 'var(--radius)' }} />
}

export default function AgentsPage() {
  const { data: agentList, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agents.list(),
  })
  const { data: sessionList } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessions.list(),
  })

  // Determine running status per agent
  const runningAgentIds = new Set(
    (sessionList ?? [])
      .filter((s: Session) => s.status === 'running')
      .map((s: Session) => s.agentId)
  )

  // Group by department
  const grouped = new Map<string, Agent[]>()
  for (const agent of agentList ?? []) {
    const dept = agent.departmentId ?? 'General'
    if (!grouped.has(dept)) grouped.set(dept, [])
    grouped.get(dept)!.push(agent)
  }

  return (
    <div className="page">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--text)',
          }}
        >
          Agents
        </h1>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} />)}
        </div>
      ) : (
        <>
          {Array.from(grouped.entries()).map(([dept, deptAgents]) => (
            <section key={dept} style={{ marginBottom: 28 }}>
              {grouped.size > 1 && (
                <h2
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text-faint)',
                    marginBottom: 10,
                  }}
                >
                  {dept}
                </h2>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {deptAgents.map((agent: Agent) => {
                  const isRunning = runningAgentIds.has(agent.id)
                  const runningSession = (sessionList ?? []).find(
                    (s: Session) => s.agentId === agent.id && s.status === 'running'
                  )
                  return (
                    <AgentCard
                      key={agent.id}
                      name={agent.name}
                      role={agent.role}
                      status={isRunning ? 'running' : 'idle'}
                      currentTask={runningSession?.workDir?.split('/').pop()}
                    />
                  )
                })}
              </div>
            </section>
          ))}

          {/* Hire agent button */}
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '14px',
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-faint)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'border-color 200ms, color 200ms',
              marginTop: 8,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--border-accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-faint)'
            }}
          >
            <UserPlus size={18} strokeWidth={1.5} />
            Hire agent
          </button>
        </>
      )}
    </div>
  )
}
