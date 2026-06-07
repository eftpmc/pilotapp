import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { admin } from '../api/client'
import { SpinePartPreview } from '@/components/SpineAvatar'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Part definitions
// ---------------------------------------------------------------------------

interface WeightedVariant { id: number; defaultWeight: number }

type PartDef =
  | { type: 'weighted'; label: string; variants: WeightedVariant[]; baseSkins: string[] }
  | { type: 'uniform';  label: string; variants: number[]; baseSkins: string[]; bustMode?: boolean }
  | { type: 'chance';   label: string; variants: number[]; baseSkins: string[] }

const BASE  = ['skin/skin_1']
const EYES  = ['eyes/eyes_c_2']
const HAIR1 = ['hair_short/hair_short_c_1']
const BROW1 = ['brow/brow_c_1']
const MTH1  = ['mouth/mouth_c_1']

const PARTS: Record<string, PartDef> = {
  hair:  { type: 'uniform',  label: 'Hair',  bustMode: false, baseSkins: [...BASE, ...EYES, ...BROW1, ...MTH1], variants: Array.from({ length: 30 }, (_, i) => i + 1) },
  eyes:  { type: 'weighted', label: 'Eyes',  baseSkins: [...BASE, ...HAIR1, ...BROW1, ...MTH1], variants: [{ id:2,defaultWeight:80 },{ id:3,defaultWeight:5 },{ id:4,defaultWeight:5 },{ id:6,defaultWeight:4 },{ id:11,defaultWeight:3 },{ id:13,defaultWeight:3 }] },
  mouth: { type: 'weighted', label: 'Mouth', baseSkins: [...BASE, ...HAIR1, ...EYES, ...BROW1], variants: [{ id:1,defaultWeight:80 },{ id:3,defaultWeight:5 },{ id:4,defaultWeight:5 },{ id:6,defaultWeight:4 },{ id:8,defaultWeight:3 },{ id:9,defaultWeight:3 }] },
  brow:  { type: 'uniform',  label: 'Brow',  baseSkins: [...BASE, ...HAIR1, ...EYES, ...MTH1], variants: [1,2,3,4,5,8,9] },
  top:   { type: 'uniform',  label: 'Top',   bustMode: true,  baseSkins: [...BASE, ...HAIR1, ...EYES, ...BROW1, ...MTH1], variants: Array.from({ length: 48 }, (_, i) => i + 1) },
  beard: { type: 'chance',   label: 'Beard', baseSkins: [...BASE, ...HAIR1, ...EYES, ...BROW1, ...MTH1], variants: Array.from({ length: 10 }, (_, i) => i + 1) },
}

function variantIds(part: PartDef): number[] {
  return part.type === 'weighted' ? part.variants.map(v => v.id) : part.variants as number[]
}

function skinNameFor(partKey: string, variantId: number): string {
  if (partKey === 'hair')  return `hair_short/hair_short_c_${variantId}`
  if (partKey === 'eyes')  return `eyes/eyes_c_${variantId}`
  if (partKey === 'mouth') return `mouth/mouth_c_${variantId}`
  if (partKey === 'brow')  return `brow/brow_c_${variantId}`
  if (partKey === 'top')   return `top/top_c_${variantId}`
  if (partKey === 'beard') return `beard/beard_c_${variantId}`
  return ''
}

// ---------------------------------------------------------------------------
// VariantCard
// ---------------------------------------------------------------------------

function VariantCard({
  partKey,
  part,
  variantId,
  saved,
}: {
  partKey: string
  part: PartDef
  variantId: number
  saved: { excluded: boolean; weight: number }
}) {
  const qc = useQueryClient()
  const [showWeight, setShowWeight] = useState(false)
  const [weightInput, setWeightInput] = useState('')

  const patch = useMutation({
    mutationFn: (body: { excluded?: boolean; weight?: number }) =>
      admin.updateVariant(partKey, variantId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin/characters'] }),
  })

  const bustMode = part.type !== 'weighted' && (part as { bustMode?: boolean }).bustMode === true
  const previewSkins = [...part.baseSkins, skinNameFor(partKey, variantId)]
  const defaultWeight = part.type === 'weighted'
    ? (part.variants.find(v => v.id === variantId)?.defaultWeight ?? 1)
    : 1
  const effectiveWeight = saved.weight > 0 ? saved.weight : defaultWeight
  const isCustomWeight  = saved.weight > 0

  return (
    <div className={cn(
      'group relative flex flex-col rounded-lg border overflow-hidden cursor-pointer transition-all select-none',
      saved.excluded
        ? 'border-destructive/20 opacity-40 hover:opacity-60'
        : 'border-border hover:border-primary/40',
    )}>
      {/* Preview canvas */}
      <div className="bg-muted/30 flex items-center justify-center py-1">
        <SpinePartPreview
          skins={previewSkins}
          width={bustMode ? 64 : 56}
          height={bustMode ? 72 : 64}
          bustMode={bustMode}
        />
      </div>

      {/* Footer */}
      <div className="px-2 py-1.5 flex items-center justify-between gap-1 bg-card">
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">{variantId}</span>

        {/* Weight badge (weighted parts only) */}
        {part.type === 'weighted' && !saved.excluded && (
          showWeight ? (
            <input
              className="w-10 text-[10px] font-mono bg-input border border-border rounded px-1 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary"
              value={weightInput}
              autoFocus
              onClick={e => e.stopPropagation()}
              onChange={e => setWeightInput(e.target.value)}
              onBlur={() => {
                const n = parseInt(weightInput, 10)
                if (!isNaN(n) && n >= 0) patch.mutate({ weight: n })
                setShowWeight(false)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setShowWeight(false)
              }}
            />
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setWeightInput(String(effectiveWeight)); setShowWeight(true) }}
              className={cn(
                'text-[10px] font-mono px-1 py-0.5 rounded border transition-colors cursor-pointer',
                isCustomWeight
                  ? 'border-primary/40 text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground/40 hover:border-border',
              )}
            >
              {effectiveWeight}
            </button>
          )
        )}
      </div>

      {/* Exclude overlay — hover to reveal */}
      <button
        onClick={() => patch.mutate({ excluded: !saved.excluded })}
        disabled={patch.isPending}
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-opacity cursor-pointer border-none bg-transparent',
          saved.excluded
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <span className={cn(
          'text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full',
          saved.excluded
            ? 'bg-destructive/80 text-white'
            : 'bg-black/60 text-white',
        )}>
          {saved.excluded ? 'Excluded' : 'Exclude'}
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PartSection
// ---------------------------------------------------------------------------

function PartSection({
  partKey,
  part,
  savedRows,
  beardChance,
}: {
  partKey: string
  part: PartDef
  savedRows: { variant: number; excluded: boolean; weight: number }[]
  beardChance: number
}) {
  const qc = useQueryClient()
  const [editingChance, setEditingChance] = useState(false)
  const [chanceInput,   setChanceInput]   = useState(String(beardChance))

  const patchChance = useMutation({
    mutationFn: (chance: number) => admin.updateBeardChance(chance),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin/characters'] }),
  })

  const savedMap: Record<number, { excluded: boolean; weight: number }> = {}
  for (const r of savedRows) savedMap[r.variant] = r

  const ids          = variantIds(part)
  const excludedCount = ids.filter(id => savedMap[id]?.excluded).length

  return (
    <section className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <p className="text-xs font-medium text-foreground">{part.label}</p>
        <span className="text-[10px] font-mono text-muted-foreground/40">
          {ids.length - excludedCount}/{ids.length}
        </span>
        {excludedCount > 0 && (
          <span className="text-[10px] font-semibold text-destructive/70">{excludedCount} excluded</span>
        )}

        {/* Beard global chance */}
        {part.type === 'chance' && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Chance:</span>
            {editingChance ? (
              <input
                className="w-16 text-xs font-mono bg-input border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary"
                value={chanceInput}
                autoFocus
                onChange={e => setChanceInput(e.target.value)}
                onBlur={() => {
                  const n = parseInt(chanceInput, 10)
                  if (!isNaN(n) && n >= 0 && n <= 100) patchChance.mutate(n)
                  setEditingChance(false)
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') { setEditingChance(false); setChanceInput(String(beardChance)) }
                }}
              />
            ) : (
              <button
                onClick={() => { setEditingChance(true); setChanceInput(String(beardChance)) }}
                className="text-xs font-mono font-semibold text-primary px-2 py-0.5 rounded border border-primary/30 bg-primary/5 hover:bg-primary/10 cursor-pointer transition-colors"
              >
                {beardChance}%
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className={cn(
        'grid gap-2',
        part.type === 'weighted' || ids.length <= 9
          ? 'grid-cols-[repeat(auto-fill,minmax(72px,1fr))]'
          : 'grid-cols-[repeat(auto-fill,minmax(68px,1fr))]',
      )}>
        {ids.map(id => (
          <VariantCard
            key={id}
            partKey={partKey}
            part={part}
            variantId={id}
            saved={savedMap[id] ?? { excluded: false, weight: 0 }}
          />
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminCharactersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin/characters'],
    queryFn:  () => admin.characters(),
  })

  const savedSettings = data?.settings ?? {}
  const beardChance   = data?.beardChance ?? 10

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-6 pt-10 pb-12 flex flex-col gap-10">

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hover a variant to exclude it. Click the weight number to override it.
          </p>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          Object.entries(PARTS).map(([key, part]) => (
            <PartSection
              key={key}
              partKey={key}
              part={part}
              savedRows={(savedSettings[key] ?? []).map(r => ({
                variant:  r.variant,
                excluded: r.excluded,
                weight:   r.weight,
              }))}
              beardChance={beardChance}
            />
          ))
        )}
      </div>
    </div>
  )
}
