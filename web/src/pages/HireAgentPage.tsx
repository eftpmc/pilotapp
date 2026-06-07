import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agents, connections, departments } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { PersonalityPicker } from '@/components/PersonalityPicker'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ROSTER, PERSONALITY_PRESETS } from '@/lib/agent-constants'
import { Dices } from 'lucide-react'

function randomSeed() { return Math.random().toString(36).slice(2, 10) }

export default function HireAgentPage() {
  const { presetId } = useParams<{ presetId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const isCustom = presetId === 'custom'
  const preset = isCustom ? null : ROSTER.find(r => r.name.toLowerCase() === presetId)

  const { data: connList = [] } = useQuery({ queryKey: ['connections'], queryFn: () => connections.list() })
  const { data: deptList = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })

  const [name,         setName]    = useState(preset?.name ?? '')
  const [seed,         setSeed]    = useState(preset?.avatarSeed ?? randomSeed)
  const [personality,  setPersona] = useState(() => {
    if (!preset) return ''
    return preset.presets
      .map(l => PERSONALITY_PRESETS.find(p => p.label === l)?.prompt ?? '')
      .filter(Boolean).join('\n\n')
  })
  const [connectionId, setConnId]  = useState('')
  const [departmentId, setDeptId]  = useState('')

  const effectiveConnId = connectionId || connList[0]?.id || ''

  const createAgent = useMutation({
    mutationFn: (body: Parameters<typeof agents.create>[0]) => agents.create(body),
    onSuccess: (agent) => { qc.invalidateQueries({ queryKey: ['agents'] }); navigate(`/agents/${agent.id}`) },
  })

  function hire() {
    if (!effectiveConnId) return
    createAgent.mutate({
      name: (isCustom ? name : preset!.name).trim(),
      connectionId: effectiveConnId,
      personality: personality.trim() || undefined,
      role: preset?.role ?? 'worker',
      departmentId: departmentId || undefined,
      avatarSeed: isCustom ? seed : preset!.avatarSeed,
    })
  }

  const presetPersonalities = preset
    ? preset.presets.map(l => PERSONALITY_PRESETS.find(p => p.label === l)).filter(Boolean) as typeof PERSONALITY_PRESETS
    : []

  const displayName = isCustom ? (name || 'New') : preset?.name ?? ''

  if (!isCustom && !preset) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Agent not found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-6 pt-10 pb-16">

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/agents/hire')} className="mb-8 -ml-2 text-muted-foreground">
          <ArrowLeft size={13} />
          Hire an agent
        </Button>

        {/* Hero */}
        <div className="flex items-end gap-5 mb-10">
          <div className="shrink-0">
            {isCustom ? (
              <div className="flex items-end gap-2">
                <AgentAvatar name={displayName} seed={seed} size={80} />
                <Button
                  type="button" size="icon" variant="ghost"
                  onClick={() => setSeed(randomSeed())}
                  title="Roll new avatar"
                  className="w-7 h-7 rounded-lg mb-0.5"
                >
                  <Dices size={13} />
                </Button>
              </div>
            ) : (
              <AgentAvatar name={displayName} seed={preset!.avatarSeed} size={80} />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {isCustom ? (
              <Input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Name this agent…"
                className="text-2xl font-semibold h-auto py-0 px-0 border-none bg-transparent shadow-none focus-visible:ring-0 tracking-tight leading-none mb-2 w-full"
              />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight leading-none mb-2">{preset!.name}</h1>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {preset?.role === 'lead' && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={{ color: 'var(--ember)', background: 'var(--ember-wash)' }}
                >Lead</span>
              )}
              {!isCustom && (
                <p className="text-sm text-muted-foreground">{preset!.bio}</p>
              )}
            </div>
            {!isCustom && preset!.presets.length > 0 && (
              <div className="flex gap-1.5 mt-3">
                {preset!.presets.map(p => (
                  <span key={p} className="na-roster-tag" style={{ fontSize: 11 }}>{p}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-10">

          {/* Personality — preset description only */}
          {!isCustom && presetPersonalities.length > 0 && (
            <section>
              <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/40">
                {presetPersonalities.map(p => (
                  <p key={p.label} className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">{p.label}. </span>
                    {p.prompt}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Personality — custom editable */}
          {isCustom && (
            <section>
              <p className="text-xs font-medium text-muted-foreground/50 mb-4">Personality</p>
              <PersonalityPicker value={personality} onChange={setPersona} />
            </section>
          )}

          {/* Hire */}
          <section className="border-t border-border/40 pt-8">
            <p className="text-xs font-medium text-muted-foreground/50 mb-4">Hire</p>
            {connList.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">You need a connection (API key) before you can hire agents.</p>
                <Button variant="outline" className="w-fit" onClick={() => navigate('/settings')}>
                  Add a connection →
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Connection</Label>
                  <Select value={effectiveConnId} onValueChange={setConnId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {connList.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.model ? ` · ${c.model}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {deptList.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <Label>Team <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Select value={departmentId || '__none'} onValueChange={v => setDeptId(v === '__none' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No team</SelectItem>
                        {deptList.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {createAgent.isError && (
                  <p className="text-xs text-destructive">{createAgent.error.message}</p>
                )}
                <Button
                  disabled={createAgent.isPending || (isCustom && !name.trim())}
                  onClick={hire}
                  className="w-fit"
                >
                  {createAgent.isPending
                    ? 'Hiring…'
                    : `Hire ${isCustom ? (name.trim() || 'agent') : preset!.name}`}
                </Button>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
