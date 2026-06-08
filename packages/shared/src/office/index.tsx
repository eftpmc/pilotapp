import React, { Suspense, useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html, useAnimations } from '@react-three/drei'
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { getOfficeSettings } from '../lib/officeSettings'
import { agents as agentsApi, projects as projectsApi, sessions as sessionsApi, tasks as tasksApi, getBaseUrl } from '../api/client'
import type { Agent, Project, Session, Task } from '../api/client'
import * as THREE from 'three'
import { X, GitBranch, FolderOpen, ArrowRight } from 'lucide-react'
import { AgentAvatar } from '../components/AgentAvatar'

export type OfficeMode = 'live' | 'build' | 'watch'

// ─── Assets ──────────────────────────────────────────────────────────────────

const F = '/kaykit/KayKit_Furniture_Bits_1.0_EXTRA/Assets/gltf/'
const P = '/kaykit/KayKit_Prototype_Bits_1.1_EXTRA/Assets/gltf/'
const A = '/kaykit/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/'

// Desk furniture
const DESK    = F + 'desk.gltf'
const CHAIR   = F + 'chair_desk_A.gltf'
const MONITOR = F + 'monitor.gltf'

// Break room furniture
const COUCH   = F + 'couch_pillows.gltf'
const TABLE_L = F + 'table_low.gltf'
const CACTUS  = F + 'cactus_medium_A.gltf'
const RUG     = F + 'rug_rectangle_A.gltf'

// Room architecture (from Prototype Bits)
const WALL_TILE  = P + 'Wall.gltf'
const WALL_WIN   = P + 'Wall_Window_Open.gltf'
const WALL_DOOR  = P + 'Wall_Doorway.gltf'
const FLOOR_TILE = P + 'Floor.gltf'

// Character rigs
const RIG_SIM   = A + 'Rig_Medium_Simulation.glb'
const RIG_MOVE  = A + 'Rig_Medium_MovementBasic.glb'
const RIG_GEN   = A + 'Rig_Medium_General.glb'
const RIG_TOOLS = A + 'Rig_Medium_Tools.glb'

// Mannequin_Medium.glb is the proper base mesh — it has the embedded texture
// that the Rig files omit. Bone names are identical so animations cross-apply.
const MANNEQUIN = '/kaykit/KayKit_Character_Animations_1.1/Mannequin%20Character/characters/Mannequin_Medium.glb'

;[DESK, CHAIR, MONITOR,
  COUCH, TABLE_L, CACTUS, RUG,
  WALL_TILE, WALL_WIN, WALL_DOOR, FLOOR_TILE,
  MANNEQUIN, RIG_SIM, RIG_MOVE, RIG_GEN, RIG_TOOLS,
].forEach(u => useGLTF.preload(u))

// ─── Room dimensions ──────────────────────────────────────────────────────────
const TILE    = 4
const FLOOR_Y = -0.5
const ROOM_W  = 8
const ROOM_D  = 6
const HALF_W  = (ROOM_W * TILE) / 2
const HALF_D  = (ROOM_D * TILE) / 2

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  running: '#35bb78', waiting: '#d49e40', done: '#ff6b35',
  error: '#ec6b5c', idle: '#7a7770', merged: '#aca89f',
}
const STATUS_LABEL: Record<string, string> = {
  running: 'Working', waiting: 'Waiting', done: 'Done',
  error: 'Error', idle: 'Idle', merged: 'Merged',
}

// ─── Desk zone ────────────────────────────────────────────────────────────────
// Desks live in the center-right quadrant, clear of the break room partition.
// With DESK_SPACING=5 and 3 cols × 2 rows the grid spans ~10×5 units centered
// at WORK_ZONE. MAX_DESKS is the capacity for this room size; agents beyond
// that index are still created but share the last desk slot visually.

const DESK_SPACING = 5.0
const MAX_DESKS    = 6
const WORK_ZONE    = new THREE.Vector3(3, 0, 0)

function deskPosition(index: number, total: number): THREE.Vector3 {
  const count     = Math.min(total, MAX_DESKS)
  const clamped   = Math.min(index, count - 1)
  const cols      = Math.min(count, 3)
  const col       = clamped % cols
  const row       = Math.floor(clamped / cols)
  const rowCount  = Math.ceil(count / cols)
  const colsInRow = clamped < Math.floor(count / cols) * cols ? cols : count % cols || cols
  const x = WORK_ZONE.x + col * DESK_SPACING - (colsInRow - 1) * DESK_SPACING * 0.5
  const z = WORK_ZONE.z + row * DESK_SPACING - (rowCount  - 1) * DESK_SPACING * 0.5
  return new THREE.Vector3(x, 0, z)
}

// ─── Shared cloneable model ───────────────────────────────────────────────────

function Model({ url, position = [0,0,0] as T3, rotation = [0,0,0] as T3, scale = 1 }: {
  url: string; position?: T3; rotation?: T3; scale?: number
}) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  return <primitive object={clone} position={position} rotation={rotation} scale={scale} />
}
type T3 = [number, number, number]

// ─── Room ─────────────────────────────────────────────────────────────────────

function Room() {
  const floor = [] as React.ReactElement[]
  const walls = [] as React.ReactElement[]

  for (let x = 0; x < ROOM_W; x++) {
    for (let z = 0; z < ROOM_D; z++) {
      const px = x * TILE - HALF_W + TILE / 2
      const pz = z * TILE - HALF_D + TILE / 2
      floor.push(<Model key={`f${x}_${z}`} url={FLOOR_TILE} position={[px, FLOOR_Y, pz]} />)
    }
  }

  for (let x = 0; x < ROOM_W; x++) {
    const px = x * TILE - HALF_W + TILE / 2
    const mid = Math.floor(ROOM_W / 2)
    walls.push(<Model key={`wn${x}`} url={WALL_TILE} position={[px, 0, -HALF_D]} rotation={[0, Math.PI, 0]} />)
    const sUrl = x === mid ? WALL_DOOR : (x === 1 || x === ROOM_W - 2) ? WALL_WIN : WALL_TILE
    walls.push(<Model key={`ws${x}`} url={sUrl} position={[px, 0, HALF_D]} rotation={[0, 0, 0]} />)
  }

  for (let z = 0; z < ROOM_D; z++) {
    const pz = z * TILE - HALF_D + TILE / 2
    const wUrl = z === Math.floor(ROOM_D / 2) ? WALL_WIN : WALL_TILE
    walls.push(<Model key={`ww${z}`} url={wUrl} position={[-HALF_W, 0, pz]} rotation={[0,  Math.PI / 2, 0]} />)
    walls.push(<Model key={`we${z}`} url={wUrl} position={[ HALF_W, 0, pz]} rotation={[0, -Math.PI / 2, 0]} />)
  }

  return <>{floor}{walls}</>
}

// ─── Screen glow ─────────────────────────────────────────────────────────────

function ScreenGlow({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  const intensity = status === 'running' ? 1.8 : status === 'waiting' ? 0.7 : 0.0
  if (intensity === 0) return null
  return (
    <pointLight position={[0, 1.15, -0.28 + 0.35]} color={color}
      intensity={intensity} distance={3} decay={2} />
  )
}

// ─── Desk furniture at world position ────────────────────────────────────────

function WorkDesk({ worldPos, status }: { worldPos: THREE.Vector3; status: string }) {
  return (
    <group position={worldPos.toArray()} onPointerDown={(e) => e.stopPropagation()}>
      <Model url={DESK} />
      <Model url={CHAIR}    position={[0, 0,      1.0]}  rotation={[0, Math.PI, 0]} />
      <Model url={MONITOR}  position={[0, 0.95,  -0.28]} />
      <ScreenGlow status={status} />
    </group>
  )
}

// ─── Break room ───────────────────────────────────────────────────────────────

function BreakRoom() {
  // Tucked into back-left corner
  return (
    <group position={[-11, 0, -8]}>
      {/* Rug underneath everything */}
      <Model url={RUG}   position={[0, 0.01, 0.5]} rotation={[0, Math.PI / 2, 0]} />
      {/* Couch against the back-left wall, facing into the room */}
      <Model url={COUCH}   position={[0, 0, -1.5]} rotation={[0, 0, 0]} />
      {/* Low coffee table in front of couch */}
      <Model url={TABLE_L} position={[0, 0,  0.8]} />
      {/* Plant in the corner */}
      <Model url={CACTUS}  position={[-2.2, 0, -2.2]} />
    </group>
  )
}

// ─── Walking agent character ──────────────────────────────────────────────────

type AgentState = 'wander' | 'walk_to_desk' | 'sit' | 'leave_desk' | 'walk_to_break' | 'lounge'

const SEP_RADIUS  = 1.5  // agent-agent separation distance
const DESK_RADIUS = 2.4  // how far to start swerving around other desks

// Two seats on the break room couch — face into the room (facing = 0 → +Z)
const LOUNGE_SEATS = [
  { pos: new THREE.Vector3(-11.5, 0.08, -9.2), facing: 0 },
  { pos: new THREE.Vector3(-10.5, 0.08, -9.2), facing: 0 },
]

function WalkingAgent({
  agent, session, deskPos, bounds, isSelected, onSelect,
  followRef, selectedIdRef, walkSpeed, wanderSpeed,
  agentIndex, sharedPositions, allDeskPositions, occupiedSeats,
}: {
  agent: Agent; session?: Session
  deskPos: THREE.Vector3; bounds: number
  isSelected: boolean; onSelect: () => void
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  selectedIdRef: React.MutableRefObject<string | null>
  walkSpeed: number; wanderSpeed: number
  agentIndex: number
  sharedPositions: THREE.Vector3[]
  allDeskPositions: THREE.Vector3[]
  occupiedSeats: React.MutableRefObject<Set<number>>
}) {
  const groupRef    = useRef<THREE.Group>(null)
  const rigRef      = useRef<THREE.Group>(null)
  const pos         = useRef(new THREE.Vector3(
    (Math.random() - 0.5) * bounds,
    0,
    (Math.random() - 0.5) * bounds,
  ))
  const target      = useRef(new THREE.Vector3())
  const stateRef    = useRef<AgentState>('wander')
  const nextPickAt  = useRef(0)
  const curAnim     = useRef('')
  const seatRef     = useRef<typeof LOUNGE_SEATS[number] | null>(null)
  const seatIndexRef = useRef<number>(-1)
  const loungeUntil = useRef(0)

  function releaseSeat() {
    if (seatIndexRef.current !== -1) {
      occupiedSeats.current.delete(seatIndexRef.current)
      seatIndexRef.current = -1
    }
    seatRef.current = null
  }

  const status = session?.status ?? 'idle'
  const isWorking = status === 'running' || status === 'waiting'

  // Mannequin_Medium.glb: textured mesh + skeleton (no animations)
  // Rig files: animations only (no embedded texture)
  const { scene: mannequinScene }         = useGLTF(MANNEQUIN)
  const { animations: simAnims }          = useGLTF(RIG_SIM)
  const { animations: moveAnims }         = useGLTF(RIG_MOVE)
  const { animations: genAnims }          = useGLTF(RIG_GEN)
  const { animations: toolAnims }         = useGLTF(RIG_TOOLS)

  const clone    = useMemo(() => SkeletonUtils.clone(mannequinScene), [mannequinScene])
  const allAnims = useMemo(
    () => [...simAnims, ...moveAnims, ...genAnims, ...toolAnims],
    [simAnims, moveAnims, genAnims, toolAnims],
  )
  const { actions } = useAnimations(allAnims, rigRef)

  const play = useCallback((name: string) => {
    if (!actions || curAnim.current === name) return
    const action = actions[name]
    if (!action) return
    Object.values(actions).forEach(a => a?.fadeOut(0.25))
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.25).play()
    curAnim.current = name
  }, [actions])

  // Resolve animation names (handle both "Walk" and "Walking" etc.)
  const animNames = useMemo(() => {
    const names = allAnims.map(a => a.name)
    const find = (...patterns: RegExp[]) => {
      for (const p of patterns) { const n = names.find(x => p.test(x)); if (n) return n }
      return ''
    }
    return {
      walk:  find(/^Walking_A$/i, /^Walk$/i, /walking/i, /walk/i),
      run:   find(/^Running_A$/i, /^Run$/i,  /running/i, /run/i),
      idle:  find(/^Idle_A$/i,    /idle_a/i, /idle/i),
      idle2: find(/^Idle_B$/i,    /idle_b/i),
      sit:   find(/^Sit_Chair_Idle$/i, /sit_chair_idle/i, /sit_chair/i),
      work:  find(/^Working_A$/i, /^Work_A$/i, /working/i, /work/i),
      wave:  find(/^Waving$/i, /waving/i),
    }
  }, [allAnims])

  function pickWanderTarget() {
    const otherDesks = allDeskPositions.filter((_, i) => i !== agentIndex)
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2
      const r = bounds * 0.1 + Math.random() * bounds * 0.7
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r
      const blocked = otherDesks.some(dp => {
        const dx = cx - dp.x, dz = cz - dp.z
        return dx * dx + dz * dz < DESK_RADIUS * DESK_RADIUS
      })
      if (!blocked) { target.current.set(cx, 0, cz); return }
    }
    // fallback: middle of room
    target.current.set(
      (Math.random() - 0.5) * bounds * 0.4, 0,
      (Math.random() - 0.5) * bounds * 0.4,
    )
  }

  useEffect(() => {
    pickWanderTarget()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chair is at deskPos + [0, 0, 1.0]; character sits slightly in front at Z+0.65, Y+0.08
  const chairPos = useMemo(
    () => deskPos.clone().add(new THREE.Vector3(0, 0, 0.65)),
    [deskPos],
  )

  // Compute combined avoidance steering (agent separation + optional desk repulsion)
  function avoidanceForce(includeDeskAvoidance: boolean): THREE.Vector3 {
    const av = new THREE.Vector3()

    // Agent-agent separation
    for (let i = 0; i < sharedPositions.length; i++) {
      if (i === agentIndex) continue
      const other = sharedPositions[i]
      const dx = pos.current.x - other.x
      const dz = pos.current.z - other.z
      const dist2 = dx * dx + dz * dz
      if (dist2 < SEP_RADIUS * SEP_RADIUS && dist2 > 0.0001) {
        const dist = Math.sqrt(dist2)
        const strength = (SEP_RADIUS - dist) / SEP_RADIUS
        av.x += (dx / dist) * strength * 2.0
        av.z += (dz / dist) * strength * 2.0
      }
    }

    // Desk avoidance — skip own desk so the agent isn't repelled from their seat
    if (includeDeskAvoidance) {
      for (let i = 0; i < allDeskPositions.length; i++) {
        if (i === agentIndex) continue
        const dp = allDeskPositions[i]
        const dx = pos.current.x - dp.x
        const dz = pos.current.z - dp.z
        const dist2 = dx * dx + dz * dz
        if (dist2 < DESK_RADIUS * DESK_RADIUS && dist2 > 0.0001) {
          const dist = Math.sqrt(dist2)
          const strength = (DESK_RADIUS - dist) / DESK_RADIUS
          av.x += (dx / dist) * strength * 1.5
          av.z += (dz / dist) * strength * 1.5
        }
      }
    }

    return av
  }

  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return

    // Always publish current position so siblings can read it
    sharedPositions[agentIndex].copy(pos.current)

    const ARRIVE_DIST = 0.35
    const ROT_SPEED   = dt * 10

    if (isWorking) {
      // ── walk to chair, then sit / work ──────────────
      if (stateRef.current === 'sit') {
        g.position.set(chairPos.x, 0.08, chairPos.z)
        const deskAnim = status === 'running'
          ? (animNames.work || animNames.sit || 'Sit_Chair_Idle')
          : (animNames.sit  || 'Sit_Chair_Idle')
        play(deskAnim)
      } else {
        releaseSeat()
        stateRef.current = 'walk_to_desk'
        const dist = pos.current.distanceTo(chairPos)
        if (dist > ARRIVE_DIST) {
          const dir = chairPos.clone().sub(pos.current).normalize()
          // Agent-only separation while walking to desk (no desk repulsion — heading there intentionally)
          const av = avoidanceForce(false)
          dir.x += av.x; dir.z += av.z
          const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
          if (len > 0.01) { dir.x /= len; dir.z /= len }
          pos.current.addScaledVector(dir, dt * walkSpeed)
          const targetAngle = Math.atan2(dir.x, dir.z)
          g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetAngle, ROT_SPEED)
          g.position.set(pos.current.x, 0, pos.current.z)
          play(animNames.walk || 'Idle_A')
        } else {
          stateRef.current = 'sit'
          pos.current.copy(chairPos)
          g.rotation.y = Math.PI
          g.position.set(chairPos.x, 0.08, chairPos.z)
          play(animNames.sit || 'Sit_Chair_Idle')
        }
      }
    } else {
      // ── idle: wander / break room ────────────────────
      if (stateRef.current === 'sit' || stateRef.current === 'walk_to_desk') {
        stateRef.current = 'leave_desk'
        pickWanderTarget()
      }
      if (stateRef.current === 'leave_desk') stateRef.current = 'wander'

      if (stateRef.current === 'lounge') {
        // ── sitting on couch ──
        const seat = seatRef.current!
        g.position.set(seat.pos.x, seat.pos.y, seat.pos.z)
        g.rotation.y = seat.facing
        play(animNames.sit || 'Idle_A')
        if (Date.now() > loungeUntil.current) {
          releaseSeat()
          stateRef.current = 'wander'
          pickWanderTarget()
        }
      } else if (stateRef.current === 'walk_to_break') {
        // ── walking to couch ──
        const seat = seatRef.current!
        const dist = pos.current.distanceTo(seat.pos)
        if (dist > ARRIVE_DIST) {
          const dir = seat.pos.clone().sub(pos.current).normalize()
          const av = avoidanceForce(false)
          dir.x += av.x; dir.z += av.z
          const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
          if (len > 0.01) { dir.x /= len; dir.z /= len }
          pos.current.addScaledVector(dir, dt * walkSpeed)
          g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.atan2(dir.x, dir.z), ROT_SPEED)
          g.position.set(pos.current.x, 0, pos.current.z)
          play(animNames.walk || 'Idle_A')
        } else {
          stateRef.current = 'lounge'
          pos.current.copy(seat.pos)
          g.rotation.y = seat.facing
          g.position.set(seat.pos.x, seat.pos.y, seat.pos.z)
          play(animNames.sit || 'Idle_A')
          loungeUntil.current = Date.now() + 8000 + Math.random() * 10000
        }
      } else {
        // ── wander ──
        const dist = pos.current.distanceTo(target.current)
        if (dist < ARRIVE_DIST || Date.now() > nextPickAt.current) {
          const roll = Math.random()
          if (roll < 0.2) {
            // head to the break room — only if a seat is free
            const freeIdx = LOUNGE_SEATS.findIndex((_, i) => !occupiedSeats.current.has(i))
            if (freeIdx !== -1) {
              occupiedSeats.current.add(freeIdx)
              seatIndexRef.current = freeIdx
              seatRef.current = LOUNGE_SEATS[freeIdx]
              stateRef.current = 'walk_to_break'
            } else {
              pickWanderTarget()
              nextPickAt.current = Date.now() + 4000 + Math.random() * 6000
            }
          } else if (roll < 0.5) {
            play(animNames.idle || 'Idle_A')
            nextPickAt.current = Date.now() + 1500 + Math.random() * 3000
          } else {
            pickWanderTarget()
            nextPickAt.current = Date.now() + 4000 + Math.random() * 6000
          }
        } else {
          const dir = target.current.clone().sub(pos.current).normalize()
          const av = avoidanceForce(true)
          dir.x += av.x; dir.z += av.z
          const len = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
          if (len > 0.01) { dir.x /= len; dir.z /= len }
          pos.current.addScaledVector(dir, dt * wanderSpeed)
          g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, Math.atan2(dir.x, dir.z), ROT_SPEED)
          play(animNames.walk || 'Idle_A')
        }
        g.position.set(pos.current.x, 0, pos.current.z)
      }
    }

    if (selectedIdRef.current === agent.id) followRef.current = pos.current
  })

  const color = STATUS_COLOR[status]
  const select = useCallback(() => onSelect(), [onSelect])

  return (
    <group
      ref={groupRef}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); select() }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <group ref={rigRef} scale={0.9}>
        <primitive object={clone} />
      </group>
      {/* Status orb */}
      <StatusOrb status={status} />
      {/* Name pill */}
      <Html position={[0, 2.4, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <button
          onClick={(e) => { e.stopPropagation(); select() }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full whitespace-nowrap cursor-pointer select-none outline-none transition-all duration-150"
          style={{
            background: isSelected ? `${color}22` : 'var(--panel)',
            color: isSelected ? color : 'var(--ink-2)',
            border: `1px solid ${isSelected ? color + '55' : 'var(--rule)'}`,
            backdropFilter: 'blur(12px)',
            boxShadow: isSelected ? `0 0 12px ${color}30` : 'none',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
          {agent.name}
        </button>
      </Html>
    </group>
  )
}

// ─── Floating status orb ─────────────────────────────────────────────────────

function StatusOrb({ status }: { status: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  useFrame(() => {
    if (!ref.current) return
    ref.current.position.y = 2.0 + Math.sin(Date.now() * 0.0022) * 0.06
    if (status === 'running') {
      const s = 1 + Math.sin(Date.now() * 0.005) * 0.25
      ref.current.scale.setScalar(s)
    }
  })
  return (
    <mesh ref={ref} position={[0, 2.0, 0]}>
      <sphereGeometry args={[0.055, 12, 12]} />
      <meshStandardMaterial
        color={color} emissive={color}
        emissiveIntensity={status === 'running' ? 4 : 1.5}
        toneMapped={false}
      />
    </mesh>
  )
}

// ─── Scene lighting ──────────────────────────────────────────────────────────

const BG_NIGHT = new THREE.Color('#0e0c0a')
const BG_DAY   = new THREE.Color('#4e6878')

function SceneLighting({ isDay }: { isDay: boolean }) {
  const { scene } = useThree()
  const current = useRef(new THREE.Color(isDay ? BG_DAY : BG_NIGHT))

  useEffect(() => { scene.background = current.current }, [scene])

  useFrame((_, dt) => {
    const target = isDay ? BG_DAY : BG_NIGHT
    const k = 1 - Math.exp(-3 * dt)
    current.current.lerp(target, k)
    scene.background = current.current
  })

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[-6, 5, -4]} intensity={1.4} color="#fff4e0" distance={22} decay={2} />
      <pointLight position={[ 6, 5, -4]} intensity={1.4} color="#fff4e0" distance={22} decay={2} />
      <pointLight position={[ 0, 5,  5]} intensity={0.9} color="#ffe8d0" distance={18} decay={2} />
    </>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  agentList, sessionList, selectedId, onSelect, followRef, selectedIdRef,
  onFloorPanStart, walkSpeed, wanderSpeed, bounds, theme,
}: {
  agentList: Agent[]; sessionList: Session[]
  selectedId: string | null; onSelect: (id: string | null) => void
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  selectedIdRef: React.MutableRefObject<string | null>
  onFloorPanStart: (x: number, y: number) => void
  walkSpeed: number; wanderSpeed: number; bounds: number
  theme: 'light' | 'dark'
}) {
  const activeByAgent = useMemo(() => {
    const map = new Map<string, Session>()
    for (const s of sessionList) {
      if (s.status !== 'running' && s.status !== 'waiting' && s.status !== 'done' && s.status !== 'error') continue
      const cur = map.get(s.agentId)
      // Prefer running/waiting over done/error
      const priority = (st: string) =>
        st === 'running' ? 4 : st === 'waiting' ? 3 : st === 'done' ? 2 : st === 'error' ? 1 : 0
      if (!cur || priority(s.status) > priority(cur.status)) map.set(s.agentId, s)
    }
    return map
  }, [sessionList])

  const deskPositions = useMemo(
    () => agentList.map((_, i) => deskPosition(i, agentList.length)),
    [agentList],
  )

  // Shared mutable positions — each WalkingAgent writes its pos here every frame
  // so siblings can read it for separation steering. Sized to agent count.
  const sharedPositions = useMemo(
    () => agentList.map(() => new THREE.Vector3()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentList.length],
  )

  // Shared set of occupied lounge seat indices — prevents double-booking
  const occupiedSeats = useRef(new Set<number>())

  const isDay = theme === 'light'

  return (
    <>
      <SceneLighting isDay={isDay} />

      {/* Room */}
      <Suspense fallback={null}>
        <Room />
      </Suspense>

      {/* Invisible floor plane for click/pan detection */}
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          onFloorPanStart(e.nativeEvent.clientX, e.nativeEvent.clientY)
        }}
      >
        <planeGeometry args={[HALF_W * 2, HALF_D * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Break room */}
      <Suspense fallback={null}>
        <BreakRoom />
      </Suspense>

      {/* Desks — always present, screen glow active only when working */}
      {agentList.map((agent, i) => {
        const session = activeByAgent.get(agent.id)
        return (
          <Suspense key={agent.id} fallback={null}>
            <WorkDesk worldPos={deskPositions[i]} status={session?.status ?? 'idle'} />
          </Suspense>
        )
      })}

      {/* Walking agents */}
      {agentList.map((agent, i) => (
        <Suspense key={agent.id} fallback={null}>
          <WalkingAgent
            agent={agent}
            session={activeByAgent.get(agent.id)}
            deskPos={deskPositions[i]}
            bounds={bounds}
            isSelected={selectedId === agent.id}
            onSelect={() => onSelect(selectedId === agent.id ? null : agent.id)}
            followRef={followRef}
            selectedIdRef={selectedIdRef}
            walkSpeed={walkSpeed}
            wanderSpeed={wanderSpeed}
            agentIndex={i}
            sharedPositions={sharedPositions}
            allDeskPositions={deskPositions}
            occupiedSeats={occupiedSeats}
          />
        </Suspense>
      ))}
    </>
  )
}

// ─── Camera ──────────────────────────────────────────────────────────────────

const WATCH_VIEWS = [
  { label: 'Floor',       target: new THREE.Vector3(0, 0.8, 0),      offset: new THREE.Vector3(0, 16, 12) },
  { label: 'Active desks', target: new THREE.Vector3(5, 0.8, -1.5),   offset: new THREE.Vector3(-7, 12, 8) },
  { label: 'Break room',  target: new THREE.Vector3(-8, 0.8, -6.5),  offset: new THREE.Vector3(8, 10, 7) },
  { label: 'East wing',   target: new THREE.Vector3(2, 0.8, 4),      offset: new THREE.Vector3(9, 13, -7) },
]

function LabCamera({ followRef, panRef, freeCamera, watch, watchFocus }: {
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  panRef: React.MutableRefObject<THREE.Vector3>
  freeCamera: boolean
  watch: boolean
  watchFocus?: THREE.Vector3
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()
  const defaultTarget = useMemo(() => new THREE.Vector3(0, 0.5, 0), [])

  useFrame(({ clock }, dt) => {
    const controls = controlsRef.current
    if (!controls) return

    if (watch) {
      const cycleSeconds = 9
      const viewIndex = Math.floor(clock.elapsedTime / cycleSeconds) % WATCH_VIEWS.length
      const view = WATCH_VIEWS[viewIndex]
      const target = watchFocus && viewIndex === 1 ? watchFocus : view.target
      const desiredPosition = target.clone().add(view.offset)
      const t = 1 - Math.pow(0.01, dt)

      camera.position.lerp(desiredPosition, t)
      controls.target.lerp(target, t)
      controls.update()
      return
    }

    if (freeCamera) { controls.update(); return }

    const follow = followRef.current
    const target = follow ?? defaultTarget.clone().add(panRef.current)
    const lookAt = new THREE.Vector3(target.x, 0.8, target.z)
    const cameraOffset = follow
      ? new THREE.Vector3(0, 10, 7.5)
      : new THREE.Vector3(0, 15, 11)
    const desiredPosition = lookAt.clone().add(cameraOffset)
    const t = 1 - Math.pow(0.001, dt)

    camera.position.lerp(desiredPosition, t)
    controls.target.lerp(lookAt, t)
    controls.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 0.5, 0]}
      enabled={freeCamera}
      enablePan={freeCamera}
      enableRotate={freeCamera}
      enableZoom={freeCamera}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.4}
      minDistance={5}
      maxDistance={35}
    />
  )
}

// ─── Agent card (bottom-center) ──────────────────────────────────────────────

function AgentCard({ agent, session, project, task, onClose, onNavigate }: {
  agent: Agent; session?: Session; project?: Project; task?: Task; onClose: () => void
  onNavigate?: (path: string) => void
}) {
  const navigate = useNavigate()
  const go = (path: string) => onNavigate ? onNavigate(path) : navigate(path)
  const status = session?.status ?? 'idle'
  const color  = STATUS_COLOR[status]

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[380px] pointer-events-auto"
      style={{ zIndex: 20 }}
    >
      <div
        className="rounded-2xl flex flex-col gap-0 overflow-hidden"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--rule)',
          backdropFilter: 'blur(24px)',
          boxShadow: 'var(--shadow-dialog)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <AgentAvatar agent={agent} size={40} running={status === 'running'} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--ink)] leading-tight">{agent.name}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">{(agent as any).model ?? agent.provider}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: `${color}1a`, color, border: `1px solid ${color}28` }}
            >
              {STATUS_LABEL[status]}
            </span>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--panel-2)] transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--rule-soft)', margin: '0 16px' }} />

        {/* Task block */}
        <div className="px-4 py-3">
          {task ? (
            <button
              type="button"
              onClick={() => go(`/sessions/${session?.id ?? ''}`)}
              className="w-full text-left rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--panel-2)] group"
              style={{ background: 'var(--panel-2)', border: '1px solid var(--rule-soft)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--faint)] mb-1">Current task</div>
                  <div className="text-sm font-medium text-[var(--ink)] line-clamp-2 leading-snug">
                    {task.title}
                  </div>
                </div>
                <ArrowRight size={13} className="text-[var(--faint)] mt-4 shrink-0 group-hover:text-[var(--muted)] transition-colors" />
              </div>
              {project && (
                <div className="mt-2 flex items-center gap-1 text-[11px] text-[var(--faint)]">
                  <FolderOpen size={10} />
                  <span className="truncate">{project.name}</span>
                  {session?.branch && (
                    <>
                      <span className="mx-1 opacity-40">·</span>
                      <GitBranch size={10} />
                      <span className="font-mono truncate">{session.branch}</span>
                    </>
                  )}
                </div>
              )}
            </button>
          ) : (
            <div className="text-xs text-[var(--faint)] py-1">No active task</div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <button
            onClick={() => go(`/agents/${agent.id}`)}
            className="flex-1 text-xs py-2 rounded-lg border text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
            style={{ border: '1px solid var(--rule)', background: 'transparent' }}
          >
            View agent
          </button>
          {session && (
            <button
              onClick={() => go(`/sessions/${session.id}`)}
              className="flex-1 text-xs py-2 rounded-lg font-medium transition-opacity hover:opacity-85"
              style={{ background: color, color: '#0e0c0a' }}
            >
              Open session
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Status badges (bottom-left ambient) ─────────────────────────────────────

const STATUS_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  running: 'success',
  waiting: 'warning',
  done:    'secondary',
  error:   'destructive',
  idle:    'secondary',
}

// Badge component inline to avoid dependency on @/components/ui/badge
function Badge({ variant, children }: { variant: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    success:     'background: #35bb7822; color: #35bb78; border: 1px solid #35bb7833',
    warning:     'background: #d49e4022; color: #d49e40; border: 1px solid #d49e4033',
    destructive: 'background: #ec6b5c22; color: #ec6b5c; border: 1px solid #ec6b5c33',
    secondary:   'background: var(--panel-2); color: var(--muted); border: 1px solid var(--rule)',
  }
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
      style={{ ...(colors[variant] ? Object.fromEntries(colors[variant].split(';').map(s => { const [k, v] = s.split(':'); return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v?.trim()] }).filter(([k]) => k)) : {}) }}
    >
      {children}
    </span>
  )
}

function OfficeHud({ agentList, sessionList }: {
  agentList: Agent[]
  sessionList: Session[]
}) {
  const counts = useMemo(() => {
    const active = new Map<string, string>()
    for (const s of sessionList) {
      if (s.status === 'running' || s.status === 'waiting' || s.status === 'done' || s.status === 'error') {
        const cur = active.get(s.agentId)
        if (!cur || s.status === 'running' || s.status === 'waiting') active.set(s.agentId, s.status)
      }
    }
    let running = 0, waiting = 0, done = 0, error = 0, idle = 0
    for (const a of agentList) {
      const st = active.get(a.id) ?? 'idle'
      if (st === 'running') running++
      else if (st === 'waiting') waiting++
      else if (st === 'done') done++
      else if (st === 'error') error++
      else idle++
    }
    return { running, waiting, done, error, idle }
  }, [agentList, sessionList])

  const items = [
    { key: 'running', label: 'Working', count: counts.running },
    { key: 'waiting', label: 'Waiting', count: counts.waiting },
    { key: 'done',    label: 'Done',    count: counts.done    },
    { key: 'error',   label: 'Error',   count: counts.error   },
    { key: 'idle',    label: 'Idle',    count: counts.idle    },
  ].filter(i => i.count > 0)

  if (items.length === 0) return null

  return (
    <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 pointer-events-none">
      {items.map(({ key, label, count }) => (
        <Badge key={key} variant={STATUS_BADGE_VARIANT[key]}>
          {count} {label}
        </Badge>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfficeBg({ active, theme, mode = 'live', showHud = true, onNavigate, onSelect }: {
  active: boolean
  theme: 'light' | 'dark'
  mode?: OfficeMode
  showHud?: boolean
  onNavigate?: (path: string) => void
  onSelect?: (agent: Agent, session: Session | undefined) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const followRef = useRef<THREE.Vector3 | null>(null)
  const panRef = useRef(new THREE.Vector3())
  const selectedIdRef = useRef<string | null>(null)
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const qc = useQueryClient()

  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],          queryFn: agentsApi.list })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions', 'lab'], queryFn: () => sessionsApi.list(), refetchInterval: 30_000 })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],        queryFn: projectsApi.list })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks'],           queryFn: () => tasksApi.list(), refetchInterval: 30_000 })

  const [officeSt, setOfficeSt] = useState(getOfficeSettings)
  useEffect(() => {
    const h = () => setOfficeSt(getOfficeSettings())
    window.addEventListener('pilot-office', h)
    return () => window.removeEventListener('pilot-office', h)
  }, [])
  const { walkSpeed, wanderSpeed, bounds, freeCamera } = officeSt
  const isWatch = mode === 'watch'
  const effectiveFreeCamera = !isWatch && freeCamera
  const [watchViewIndex, setWatchViewIndex] = useState(0)
  const watchFocus = useMemo(() => {
    const live = sessionList.find(s => s.status === 'running' || s.status === 'waiting')
    if (!live) return undefined
    const index = agentList.findIndex(a => a.id === live.agentId)
    return index >= 0 ? deskPosition(index, agentList.length).clone().add(new THREE.Vector3(0, 0.8, 0)) : undefined
  }, [agentList, sessionList])
  const watchLabel = useMemo(() => {
    if (!isWatch) return ''
    const hasLive = sessionList.some(s => s.status === 'running' || s.status === 'waiting')
    return hasLive ? 'Active desks' : WATCH_VIEWS[watchViewIndex % WATCH_VIEWS.length].label
  }, [isWatch, sessionList, watchViewIndex])

  useEffect(() => {
    if (!isWatch) return
    setSelectedId(null)
    selectedIdRef.current = null
    followRef.current = null
  }, [isWatch])

  useEffect(() => {
    if (!isWatch) return
    const id = window.setInterval(() => {
      setWatchViewIndex(Math.floor(performance.now() / 9000) % WATCH_VIEWS.length)
    }, 500)
    return () => window.clearInterval(id)
  }, [isWatch])

  // WebSocket live updates
  useEffect(() => {
    let ws: WebSocket | null = null, dead = false, delay = 1000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const base = getBaseUrl()
      const origin = base || `${location.protocol}//${location.host}`
      const proto = origin.startsWith('https') ? 'wss' : 'ws'
      const host = origin.replace(/^https?:\/\//, '')
      ws = new WebSocket(`${proto}://${host}/ws?token=${token}`)
      ws.onopen  = () => { delay = 1000; ws!.send(JSON.stringify({ type: 'subscribe-global' })) }
      ws.onmessage = (e) => {
        try { if (JSON.parse(e.data).type === 'global-event') qc.invalidateQueries({ queryKey: ['sessions', 'lab'] }) }
        catch {}
      }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror  = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [qc])

  const selectedAgent = agentList.find(a => a.id === selectedId)
  const selectedSession = selectedAgent
    ? sessionList.find(s => s.agentId === selectedId &&
        (s.status === 'running' || s.status === 'waiting' || s.status === 'done' || s.status === 'error'))
    : undefined
  const selectedProject = selectedSession
    ? projectList.find(p => p.id === selectedSession.projectId)
    : undefined
  const selectedTask = selectedSession?.workTaskId
    ? taskList.find(t => t.id === selectedSession.workTaskId)
    : undefined

  function selectAgent(id: string | null) {
    if (isWatch) return
    if (id && onSelect) {
      const agent = agentList.find(a => a.id === id)
      const session = agent
        ? sessionList.find(s => s.agentId === id &&
            (s.status === 'running' || s.status === 'waiting' || s.status === 'done' || s.status === 'error'))
        : undefined
      if (agent) { onSelect(agent, session); return }
    }
    setSelectedId(id)
    selectedIdRef.current = id
    if (!id) followRef.current = null
  }

  function startFloorPan(x: number, y: number) {
    if (!active || effectiveFreeCamera || isWatch) return
    dragRef.current = { active: true, moved: false, x, y }
    setIsPanning(true)
    selectAgent(null)
  }

  function handlePanMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag.active || effectiveFreeCamera || isWatch) return

    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true

    drag.x = e.clientX
    drag.y = e.clientY

    const PAN_SCALE = 0.025
    const PAN_LIMIT = Math.max(10, bounds * 1.15)
    panRef.current.x -= dx * PAN_SCALE
    panRef.current.z -= dy * PAN_SCALE
    panRef.current.x = THREE.MathUtils.clamp(panRef.current.x, -PAN_LIMIT, PAN_LIMIT)
    panRef.current.z = THREE.MathUtils.clamp(panRef.current.z, -PAN_LIMIT, PAN_LIMIT)
  }

  function handlePanEnd(e: React.PointerEvent<HTMLDivElement>) {
    const wasDragging = dragRef.current.moved
    dragRef.current.active = false
    setIsPanning(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (wasDragging) e.preventDefault()
  }

  return (
    <div className={cn('fixed inset-0 z-0', !active && 'pointer-events-none')}>
      {/* 3D canvas */}
      <div
        className={cn(
          'absolute inset-0',
          active && !effectiveFreeCamera && !isWatch && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
        )}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      >
        <Canvas
          camera={{ position: [0, 15, 11], fov: 45 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
          onClick={() => {
            if (isWatch) return
            if (dragRef.current.moved) return
            selectAgent(null)
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Suspense fallback={null}>
            <Scene
              agentList={agentList}
              sessionList={sessionList}
              selectedId={selectedId}
              onSelect={selectAgent}
              followRef={followRef}
              selectedIdRef={selectedIdRef}
              onFloorPanStart={startFloorPan}
              walkSpeed={walkSpeed}
              wanderSpeed={wanderSpeed}
              bounds={bounds}
              theme={theme}
            />
          </Suspense>
          <LabCamera
            followRef={followRef}
            panRef={panRef}
            freeCamera={effectiveFreeCamera}
            watch={isWatch}
            watchFocus={watchFocus}
          />
        </Canvas>
      </div>

      {/* Dim overlay when backgrounded */}
      {!active && <div className="absolute inset-0 bg-black/50" />}

      {/* Active management UI */}
      {active && isWatch && watchLabel && (
        <div
          className="absolute pointer-events-none"
          style={{ left: '50%', bottom: 20, transform: 'translateX(-50%)' }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 24,
              padding: '0 12px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(255,255,255,0.55)',
              backdropFilter: 'blur(12px)',
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {watchLabel}
          </span>
        </div>
      )}

      {active && !isWatch && showHud && (
        <>
          <OfficeHud agentList={agentList} sessionList={sessionList} />

          {selectedAgent && (
            <AgentCard
              agent={selectedAgent}
              session={selectedSession}
              project={selectedProject}
              task={selectedTask}
              onClose={() => selectAgent(null)}
              onNavigate={onNavigate}
            />
          )}
        </>
      )}
    </div>
  )
}
