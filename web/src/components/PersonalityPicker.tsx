import { useRef, useState } from 'react'
import { PERSONALITY_PRESETS } from '@/lib/agent-constants'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TooltipRoot, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const MAX_PRESETS = 3

function parsePersonality(stored: string): { labels: string[]; custom: string } {
  if (!stored) return { labels: [], custom: '' }
  const chunks = stored.split('\n\n').map(c => c.trim()).filter(Boolean)
  const labels: string[] = []
  for (const chunk of chunks) {
    const match = PERSONALITY_PRESETS.find(p => p.prompt === chunk)
    if (match) labels.push(match.label)
    else return { labels: [], custom: stored }
  }
  return { labels, custom: '' }
}

export function PersonalityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const lastEmitted = useRef(value)
  const [selected, setSelected] = useState<string[]>(() => parsePersonality(value).labels)
  const [custom, setCustom] = useState<string>(() => parsePersonality(value).custom)

  // Sync when parent changes value externally (load, cancel)
  if (value !== lastEmitted.current) {
    lastEmitted.current = value
    const p = parsePersonality(value)
    setSelected(p.labels)
    setCustom(p.custom)
  }

  function togglePreset(label: string) {
    const isSelected = selected.includes(label)
    if (!isSelected && selected.length >= MAX_PRESETS) return
    const next = isSelected ? selected.filter(l => l !== label) : [...selected, label]
    setSelected(next)
    setCustom('')
    const prompt = next
      .map(l => PERSONALITY_PRESETS.find(p => p.label === l)?.prompt ?? '')
      .filter(Boolean)
      .join('\n\n')
    lastEmitted.current = prompt
    onChange(prompt)
  }

  function handleCustom(text: string) {
    setCustom(text)
    setSelected([])
    lastEmitted.current = text
    onChange(text)
  }

  const atMax = selected.length >= MAX_PRESETS

  return (
    <div className="flex flex-col gap-3">
      <div className="agent-personality-grid">
        {PERSONALITY_PRESETS.map(preset => {
          const Icon = preset.icon
          const active = selected.includes(preset.label)
          const disabled = atMax && !active
          const firstSentence = preset.prompt.match(/^[^.!?]+[.!?]/)?.[0] ?? preset.prompt.slice(0, 80)

          return (
            <TooltipRoot key={preset.label}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => togglePreset(preset.label)}
                  className={cn(
                    'agent-choice-card',
                    active && 'active',
                    disabled && 'dimmed',
                  )}
                  aria-pressed={active}
                >
                  {active && <span className="agent-choice-check" aria-hidden>✓</span>}
                  <Icon size={20} className="agent-choice-icon" />
                  <span className="agent-choice-title">{preset.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="agent-tooltip">
                <p className="agent-tooltip-label">{preset.label}</p>
                <p className="agent-tooltip-tag">{preset.tag}</p>
                <p className="agent-tooltip-desc">{firstSentence}</p>
              </TooltipContent>
            </TooltipRoot>
          )
        })}
      </div>
      {atMax && (
        <p className="text-xs text-muted-foreground/60">Max {MAX_PRESETS} presets. Deselect one to change.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>
          Custom instructions{' '}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          value={custom}
          onChange={e => handleCustom(e.target.value)}
          rows={3}
          placeholder={
            selected.length
              ? 'Override presets with custom instructions…'
              : 'Describe how this agent should approach work, or pick presets above.'
          }
          className="resize-y text-xs"
        />
      </div>
    </div>
  )
}
