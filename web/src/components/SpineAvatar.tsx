import { useEffect, useRef } from 'react'
import {
  AssetManager,
  AtlasAttachmentLoader,
  SkeletonJson,
  Skeleton,
  AnimationState,
  AnimationStateData,
  Physics,
  Skin,
  RegionAttachment,
  type SkeletonData,
  type TextureAtlas,
} from '@esotericsoftware/spine-canvas'

// ---------------------------------------------------------------------------
// Asset loading (shared singleton)
// ---------------------------------------------------------------------------

type LoadedAssets = { skeletonData: SkeletonData; atlas: TextureAtlas }
let assetsPromise: Promise<LoadedAssets> | null = null

function loadAssets(): Promise<LoadedAssets> {
  if (assetsPromise) return assetsPromise
  assetsPromise = new Promise((resolve, reject) => {
    const manager = new AssetManager('/spine/')
    manager.loadTextureAtlas('Casual Character.atlas')
    manager.loadJson('Casual Character.json')
    function poll() {
      if (!manager.isLoadingComplete()) { requestAnimationFrame(poll); return }
      if (manager.hasErrors()) { reject(new Error(JSON.stringify(manager.getErrors()))); return }
      const atlas = manager.get('Casual Character.atlas') as TextureAtlas
      const loader = new AtlasAttachmentLoader(atlas)
      const sj = new SkeletonJson(loader)
      sj.scale = 0.5
      resolve({ skeletonData: sj.readSkeletonData(manager.get('Casual Character.json')), atlas })
    }
    requestAnimationFrame(poll)
  })
  return assetsPromise
}

// ---------------------------------------------------------------------------
// Character settings (fetched once, applied to skin generation)
// ---------------------------------------------------------------------------

interface CharSettings {
  exclusions: Record<string, number[]>;
  weights: Record<string, Record<number, number>>;
  beardChance: number;
}

const DEFAULT_CHAR_SETTINGS: CharSettings = { exclusions: {}, weights: {}, beardChance: 10 }
let charSettingsPromise: Promise<CharSettings> | null = null

function loadCharSettings(): Promise<CharSettings> {
  if (charSettingsPromise) return charSettingsPromise
  charSettingsPromise = fetch('/settings/characters', {
    headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
  })
    .then(r => r.ok ? r.json() : DEFAULT_CHAR_SETTINGS)
    .catch(() => DEFAULT_CHAR_SETTINGS)
  return charSettingsPromise
}

// ---------------------------------------------------------------------------
// Deterministic skin + color generation
// ---------------------------------------------------------------------------

function djb2(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0
  return h
}
function pickFrom<T>(name: string, salt: string, arr: T[]): T {
  return arr[djb2(name + salt) % arr.length]
}
function weightedPickDynamic(name: string, salt: string, pairs: [number, number][]): number {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  if (total === 0) return pairs[0]?.[0] ?? 1
  let v = djb2(name + salt) % total
  for (const [val, w] of pairs) { if (v < w) return val; v -= w }
  return pairs[0][0]
}

function applyExclAndWeights(
  name: string,
  salt: string,
  part: string,
  defaultWeights: [number, number][],
  settings: CharSettings,
): number {
  const excl    = new Set(settings.exclusions[part] ?? [])
  const wOverride = settings.weights[part] ?? {}
  const active: [number, number][] = defaultWeights
    .filter(([id]) => !excl.has(id))
    .map(([id, dw]) => [id, wOverride[id] ?? dw])
  if (active.length === 0) return defaultWeights[0][0]
  return weightedPickDynamic(name, salt, active)
}

function applyExclUniform(name: string, salt: string, part: string, pool: number[], settings: CharSettings): number {
  const excl   = new Set(settings.exclusions[part] ?? [])
  const active = pool.filter(v => !excl.has(v))
  if (active.length === 0) return pool[0]
  return pickFrom(name, salt, active)
}

const SKIN_TONES: [number, number, number][] = [
  [1.00, 0.88, 0.76],
  [0.97, 0.78, 0.60],
  [0.90, 0.67, 0.45],
  [0.80, 0.54, 0.32],
  [0.65, 0.42, 0.24],
  [0.50, 0.30, 0.18],
]
const HAIR_COLORS: [number, number, number][] = [
  [0.08, 0.06, 0.05],  // black
  [0.22, 0.14, 0.08],  // very dark brown
  [0.38, 0.24, 0.12],  // dark brown
  [0.52, 0.34, 0.16],  // medium brown
  [0.68, 0.46, 0.20],  // light brown
  [0.82, 0.60, 0.22],  // dirty blonde
  [0.95, 0.84, 0.40],  // blonde
  [0.72, 0.16, 0.10],  // red
  [0.55, 0.10, 0.06],  // dark red
  [0.80, 0.40, 0.10],  // auburn / copper
  [0.30, 0.08, 0.28],  // dark purple
  [0.55, 0.12, 0.42],  // magenta
  [0.10, 0.22, 0.52],  // dark blue
  [0.08, 0.42, 0.40],  // dark teal
  [0.62, 0.62, 0.62],  // gray
  [0.90, 0.90, 0.90],  // white
]

// Slot name → which color group it belongs to (head-visible slots only)
const SLOT_GROUP: Record<string, 'skin' | 'hair' | 'brow' | 'beard'> = {
  head: 'skin',
  hair: 'hair',
  brow: 'brow', beard: 'beard',
}

function buildSlotColors(name: string): Map<string, [number, number, number]> {
  const n = name.toLowerCase()
  const skin = pickFrom(n, 'sk', SKIN_TONES)
  const hair = pickFrom(n, 'hc', HAIR_COLORS)
  const brow: [number, number, number] = [hair[0] * 0.75, hair[1] * 0.75, hair[2] * 0.75]
  const beard: [number, number, number] = [hair[0] * 0.85, hair[1] * 0.85, hair[2] * 0.85]
  const groups = { skin, hair, brow, beard }
  const map = new Map<string, [number, number, number]>()
  for (const [slot, group] of Object.entries(SLOT_GROUP)) map.set(slot, groups[group])
  return map
}

function buildSkin(name: string, skeletonData: SkeletonData, settings: CharSettings): Skin {
  const n = name.toLowerCase()
  const combo = new Skin('agent')

  const hair = applyExclUniform(n, 'h', 'hair', Array.from({ length: 30 }, (_, i) => i + 1), settings)
  const eye  = applyExclAndWeights(n, 'e', 'eyes',  [[2,80],[3,5],[4,5],[6,4],[11,3],[13,3]], settings)
  const mth  = applyExclAndWeights(n, 'm', 'mouth', [[1,80],[3,5],[4,5],[6,4],[8,3],[9,3]],   settings)
  const brow = applyExclUniform(n, 'b', 'brow', [1,2,3,4,5,8,9], settings)
  const top  = applyExclUniform(n, 't', 'top',  Array.from({ length: 48 }, (_, i) => i + 1), settings)

  const parts = [
    'skin/skin_1',
    `eyes/eyes_c_${eye}`,
    `hair_short/hair_short_c_${hair}`,
    `mouth/mouth_c_${mth}`,
    `brow/brow_c_${brow}`,
    `top/top_c_${top}`,
  ]
  for (const s of parts) { const sk = skeletonData.findSkin(s); if (sk) combo.addSkin(sk) }

  const beardThreshold = 100 - (settings.beardChance ?? 10)
  if (djb2(n + 'beard') % 100 >= beardThreshold) {
    const beardVariant = applyExclUniform(n, 'beardN', 'beard', Array.from({ length: 10 }, (_, i) => i + 1), settings)
    const s = skeletonData.findSkin(`beard/beard_c_${beardVariant}`)
    if (s) combo.addSkin(s)
  }
  return combo
}

// ---------------------------------------------------------------------------
// Custom tinted renderer
// Replicates SkeletonRenderer.drawImages() but applies multiply-blend tints
// to white sprite slots (skin, hair, brows, beard).
// ---------------------------------------------------------------------------

let _oc: OffscreenCanvas | null = null
let _oCtx: OffscreenCanvasRenderingContext2D | null = null

function getTintCanvas(w: number, h: number) {
  const needW = Math.max(w, _oc?.width ?? 0)
  const needH = Math.max(h, _oc?.height ?? 0)
  if (!_oc || needW > _oc.width || needH > _oc.height) {
    _oc = new OffscreenCanvas(needW, needH)
    _oCtx = _oc.getContext('2d')!
  }
  return _oCtx!
}

function drawWithTints(
  ctx: CanvasRenderingContext2D,
  skeleton: Skeleton,
  slotColors: Map<string, [number, number, number]>,
) {
  for (const slot of skeleton.drawOrder) {
    const bone = slot.bone
    if (!bone.active) continue
    const attachment = slot.getAttachment()
    if (!(attachment instanceof RegionAttachment)) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const region = (attachment as any).region
    const image: HTMLImageElement = region.texture.getImage()
    const alpha = skeleton.color.a * slot.color.a * attachment.color.a

    ctx.save()
    ctx.globalAlpha = alpha
    ctx.transform(bone.a, bone.c, bone.b, bone.d, bone.worldX, bone.worldY)
    ctx.translate(attachment.offset[0], attachment.offset[1])
    ctx.rotate(attachment.rotation * Math.PI / 180)
    const atlasScale = attachment.width / region.originalWidth
    ctx.scale(atlasScale * attachment.scaleX, atlasScale * attachment.scaleY)
    let w: number = region.width
    let h: number = region.height
    ctx.translate(w / 2, h / 2)
    if (region.degrees === 90) {
      const t = w; w = h; h = t
      ctx.rotate(-Math.PI / 2)
    }
    ctx.scale(1, -1)
    ctx.translate(-w / 2, -h / 2)

    const sx = image.width * region.u
    const sy = image.height * region.v
    const tint = slotColors.get(slot.data.name)

    if (tint) {
      // Multiply-blend tinting via offscreen canvas:
      // 1. Draw white sprite → 2. Multiply with tint color → 3. Restore alpha mask
      const oc = getTintCanvas(w, h)
      oc.clearRect(0, 0, w, h)
      oc.drawImage(image, sx, sy, w, h, 0, 0, w, h)
      oc.globalCompositeOperation = 'multiply'
      oc.fillStyle = `rgb(${tint[0] * 255 | 0},${tint[1] * 255 | 0},${tint[2] * 255 | 0})`
      oc.fillRect(0, 0, w, h)
      oc.globalCompositeOperation = 'destination-in'
      oc.drawImage(image, sx, sy, w, h, 0, 0, w, h)
      oc.globalCompositeOperation = 'source-over'
      ctx.drawImage(_oc!, 0, 0, w, h, 0, 0, w, h)
    } else {
      ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h)
    }

    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpineAvatar({
  name,
  width,
  height,
  animation = 'Idle',
  animated = true,
}: {
  name: string
  width: number
  height: number
  animation?: string
  animated?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    if (!ctx) return

    let rafId = 0
    let lastTime = 0
    let cancelled = false

    Promise.all([loadAssets(), loadCharSettings()]).then(([{ skeletonData }, charSettings]) => {
      if (cancelled) return

      const skeleton = new Skeleton(skeletonData)
      skeleton.setSkin(buildSkin(name, skeletonData, charSettings))
      skeleton.setSlotsToSetupPose()

      const slotColors = buildSlotColors(name)

      const animStateData = new AnimationStateData(skeletonData)
      const animState = new AnimationState(animStateData)
      animState.setAnimation(0, animation, true)

      // Head crop: worldY 40–93 (chin to above hair)
      const scale = (height - 4) / 53
      const offsetX = width / 2
      const offsetY = 3 + 93 * scale

      function render(time: number) {
        if (cancelled) return
        const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0
        lastTime = time

        ctx.clearRect(0, 0, width, height)
        ctx.save()
        ctx.translate(offsetX, offsetY)
        ctx.scale(scale, -scale)  // negative Y = upright orientation

        animState.update(delta)
        animState.apply(skeleton)
        skeleton.updateWorldTransform(Physics.update)
        drawWithTints(ctx, skeleton, slotColors)

        ctx.restore()
        if (animated) rafId = requestAnimationFrame(render)
      }

      rafId = requestAnimationFrame(render)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [name, width, height, animation, animated])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  )
}

// ---------------------------------------------------------------------------
// SpinePartPreview — static single-frame render of specific skin(s) on a
// neutral base head. Used in the admin characters page.
// ---------------------------------------------------------------------------

const NEUTRAL_COLORS = new Map<string, [number, number, number]>([
  ['head',  [0.95, 0.78, 0.60]],
  ['hair',  [0.52, 0.34, 0.16]],
  ['brow',  [0.39, 0.26, 0.12]],
  ['beard', [0.44, 0.29, 0.14]],
])

export function SpinePartPreview({
  skins,
  width = 56,
  height = 64,
  bustMode = false,
}: {
  skins: string[]
  width?: number
  height?: number
  bustMode?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const key = skins.join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let cancelled = false

    loadAssets().then(({ skeletonData }) => {
      if (cancelled) return

      const combo = new Skin('preview')
      for (const s of skins) {
        const sk = skeletonData.findSkin(s)
        if (sk) combo.addSkin(sk)
      }

      const skeleton = new Skeleton(skeletonData)
      skeleton.setSkin(combo)
      skeleton.setSlotsToSetupPose()

      const animStateData = new AnimationStateData(skeletonData)
      const animState = new AnimationState(animStateData)
      animState.setAnimation(0, 'Idle', false)
      animState.update(0)
      animState.apply(skeleton)
      skeleton.updateWorldTransform(Physics.update)

      // Head crop: worldY 40–93; bust mode: 10–93 (shows collar)
      const yTop    = bustMode ? 10 : 40
      const yBottom = 93
      const range   = yBottom - yTop
      const scale   = (height - 4) / range
      const offsetX = width / 2
      const offsetY = 2 + yBottom * scale

      ctx.clearRect(0, 0, width, height)
      ctx.save()
      ctx.translate(offsetX, offsetY)
      ctx.scale(scale, -scale)
      drawWithTints(ctx, skeleton, NEUTRAL_COLORS)
      ctx.restore()
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height, bustMode])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  )
}
