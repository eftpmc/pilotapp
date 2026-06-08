import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { agents, AgentAvatar, ROSTER } from '@pilot/shared'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function HireRosterPage() {
  const navigate = useNavigate()
  const { data: agentList = [] } = useQuery({ queryKey: ['agents'], queryFn: () => agents.list() })

  const hiredSeeds = new Set(agentList.map(a => a.avatarSeed).filter(Boolean))
  const available = ROSTER.filter(r => !hiredSeeds.has(r.avatarSeed))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-6 pt-10 pb-16">

        <Button variant="ghost" size="sm" onClick={() => navigate('/agents')} className="mb-8 -ml-2 text-muted-foreground">
          <ArrowLeft size={13} />
          Agents
        </Button>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Hire an agent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a character to join your team, or build a custom agent from scratch.
          </p>
        </div>

        <div className="hire-roster-grid">
          {available.map(r => (
            <button
              key={r.name}
              type="button"
              onClick={() => navigate(`/agents/hire/${r.name.toLowerCase()}`)}
              className="hire-roster-card"
            >
              <AgentAvatar name={r.name} seed={r.avatarSeed} size={64} />
              <div className="na-roster-info">
                <div className="na-roster-name-row">
                  <span className="na-roster-name">{r.name}</span>
                  {r.role === 'lead' && (
                    <span className="chip" style={{ color: 'var(--ember)', background: 'var(--ember-wash)', border: 'none', fontSize: 9 }}>Lead</span>
                  )}
                </div>
                <p className="na-roster-bio">{r.bio}</p>
                <div className="na-roster-tags">
                  {r.presets.map(p => <span key={p} className="na-roster-tag">{p}</span>)}
                </div>
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => navigate('/agents/hire/custom')}
            className="hire-roster-card hire-roster-custom"
          >
            <div className="na-custom-icon">+</div>
            <div className="na-roster-info">
              <span className="na-roster-name">Custom</span>
              <p className="na-roster-bio">Build an agent from scratch with your own name and personality.</p>
            </div>
          </button>
        </div>

        {available.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            All preset agents are already on your team. You can still create a custom agent.
          </p>
        )}

      </div>
    </div>
  )
}
