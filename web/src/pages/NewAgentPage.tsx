import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { agents, connections, departments } from '../api/client'
import { AgentAvatar } from '@/components/AgentAvatar'
import { PersonalityPicker } from '@/components/PersonalityPicker'
import { ProviderBadge } from '@/components/ProviderBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PERSONALITY_PRESETS, ROSTER } from '@/lib/agent-constants'
import type { RosterAgent } from '@/lib/agent-constants'
import { cn } from '@/lib/utils'
import { ArrowLeft, Dices } from 'lucide-react'

function randomSeed() { return Math.random().toString(36).slice(2, 10) }

type Step = -1 | 0 | 1 | 2

const STEP_LABELS = ['Identity', 'Connection', 'Personality']

export default function NewAgentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const { data: connList = [] } = useQuery({ queryKey: ['connections'], queryFn: () => connections.list() })
  const { data: deptList = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departments.list() })

  const [step,         setStep]    = useState<Step>(-1)
  const [name,         setName]    = useState('')
  const [seed,         setSeed]    = useState(randomSeed)
  const [connectionId, setConnId]  = useState('')
  const [personality,  setPersona] = useState('')
  const [isLead,       setIsLead]  = useState(false)
  const [departmentId, setDeptId]  = useState(searchParams.get('dept') ?? '')

  const createAgent = useMutation({
    mutationFn: (body: Parameters<typeof agents.create>[0]) => agents.create(body),
    onSuccess: (agent) => { qc.invalidateQueries({ queryKey: ['agents'] }); navigate(`/agents/${agent.id}`) },
  })

  const effectiveConnId = connectionId || connList[0]?.id || ''
  const selectedBrain   = connList.find(c => c.id === effectiveConnId)
const leadBlocker     = isLead && selectedBrain && selectedBrain.type !== 'claude'
  const canCreate       = name.trim().length > 0 && !!effectiveConnId && !leadBlocker

  function pickRoster(r: RosterAgent) {
    setName(r.name)
    setSeed(r.avatarSeed)
    setIsLead(r.role === 'lead')
    const prompt = r.presets
      .map(l => PERSONALITY_PRESETS.find(p => p.label === l)?.prompt ?? '')
      .filter(Boolean).join('\n\n')
    setPersona(prompt)
    setStep(0)
  }

  function submit() {
    if (!canCreate) return
    createAgent.mutate({
      name: name.trim(),
      connectionId: effectiveConnId,
      personality: personality.trim() || undefined,
      role: isLead ? 'lead' : 'worker',
      departmentId: departmentId || undefined,
      avatarSeed: seed,
    })
  }

  const inRoster = step === -1

  return (
    <div className="na-page">

      {/* ── Topbar ── */}
      <div className="na-topbar">
        <button
          onClick={() => inRoster ? navigate('/agents') : step === 0 ? setStep(-1) : setStep(s => (s - 1) as Step)}
          className="na-back"
        >
          <ArrowLeft size={13} />
          {inRoster ? 'Agents' : step === 0 ? 'Hire' : 'Back'}
        </button>

        {!inRoster && (
          <div className="na-steps">
            {STEP_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(i as 0 | 1 | 2)}
                className={cn('na-step', step === i && 'active', i < step && 'done')}
              >
                <span className="na-step-n">{i + 1}</span>
                {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ width: inRoster ? 0 : 80 }} />
      </div>

      {/* ── Body ── */}
      <div className="na-body">

        {/* Roster */}
        {inRoster && (
          <div className="na-heading-block">
            <h1 className="na-title">Hire an agent</h1>
            <p className="na-subtitle">Pick a pre-built character or start from scratch.</p>
          </div>
        )}
        {inRoster && (
          <div className="na-roster-grid">
            {ROSTER.map(r => (
              <button key={r.name} type="button" onClick={() => pickRoster(r)} className="na-roster-card">
                <AgentAvatar name={r.name} seed={r.avatarSeed} size={64} animated={false} />
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
            <button type="button" onClick={() => setStep(0)} className="na-roster-card na-roster-custom">
              <div className="na-custom-icon">+</div>
              <div className="na-roster-info">
                <span className="na-roster-name">Custom</span>
                <p className="na-roster-bio">Build from scratch.</p>
              </div>
            </button>
          </div>
        )}

        {/* Steps */}
        {!inRoster && (
          <div className="na-step-body">

            {step === 0 && (
              <>
                <div className="na-heading-block">
                  <p className="na-kicker">Step 1 of 3</p>
                  <h2 className="na-title">Who is joining the team?</h2>
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex items-end gap-2 shrink-0">
                    <AgentAvatar name={name || 'New'} seed={seed} size={56} animated />
                    <button type="button" onClick={() => setSeed(randomSeed())} title="Roll new avatar"
                      className="btn icon ghost" style={{ width: 28, height: 28, borderRadius: 8 }}>
                      <Dices size={13} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <Label>Name</Label>
                    <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Alex"
                      onKeyDown={e => { if (e.key === 'Enter' && name.trim()) setStep(1) }} />
                  </div>
                </div>
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
                <label className="na-lead-toggle">
                  <Checkbox checked={isLead} onCheckedChange={v => setIsLead(!!v)} />
                  <div>
                    <p className="text-sm font-medium">Lead agent</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Orchestrates the team — creates tasks and coordinates workers. Claude only.</p>
                  </div>
                </label>
              </>
            )}

            {step === 1 && (
              <>
                <div className="na-heading-block">
                  <p className="na-kicker">Step 2 of 3</p>
                  <h2 className="na-title">Which connection?</h2>
                </div>
                {connList.length === 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground">You need a connection (API key) before you can add agents.</p>
                    <Button className="w-fit" onClick={() => navigate('/settings')}>Go to Settings →</Button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label>Connection</Label>
                      <Select value={effectiveConnId} onValueChange={setConnId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {connList.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedBrain && (
                      <div className="flex items-center flex-wrap gap-2 px-3 py-2.5 bg-card rounded-lg border border-border/50 text-xs text-muted-foreground">
                        <ProviderBadge type={selectedBrain.type} />
                        <span className="font-medium text-foreground">{selectedBrain.name}</span>
                        {selectedBrain.model && <span className="font-mono text-[10px]">{selectedBrain.model}</span>}
                        {!selectedBrain.hasKey && (
                          <span className="ml-auto opacity-60">{selectedBrain.type === 'claude' ? 'subscription' : 'machine auth'}</span>
                        )}
                      </div>
                    )}
                    {leadBlocker && <p className="text-xs text-destructive">Lead agents require a Claude connection.</p>}
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <div className="na-heading-block">
                  <p className="na-kicker">Step 3 of 3</p>
                  <h2 className="na-title">How should they work?</h2>
                  <p className="na-subtitle">Pick up to 3 traits, or write custom instructions.</p>
                </div>
                <PersonalityPicker value={personality} onChange={setPersona} />
              </>
            )}

          </div>
        )}

      </div>

      {/* ── Footer ── */}
      {!inRoster && (
        <div className="na-footer">
          <Button variant="outline" onClick={() => step === 0 ? setStep(-1) : setStep(s => (s - 1) as Step)}>
            {step === 0 ? '← Hire' : '← Back'}
          </Button>
          <div className="flex items-center gap-2">
            {step < 2 && (
              <Button variant="ghost" className="text-muted-foreground text-sm"
                disabled={!canCreate || createAgent.isPending} onClick={submit}>
                {createAgent.isPending ? '…' : 'Create now'}
              </Button>
            )}
            {step < 2
              ? <Button onClick={() => setStep(s => (s + 1) as Step)}>Next →</Button>
              : <Button disabled={!canCreate || createAgent.isPending} onClick={submit}>
                  {createAgent.isPending ? 'Hiring…' : 'Hire agent'}
                </Button>
            }
          </div>
        </div>
      )}

    </div>
  )
}
