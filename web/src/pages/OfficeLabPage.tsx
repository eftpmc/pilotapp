import { Suspense, useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html, useAnimations, Grid, Environment } from '@react-three/drei'
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Leva, useControls } from 'leva'
import { agents as agentsApi, projects as projectsApi, sessions as sessionsApi, tasks as tasksApi } from '@/api/client'
import type { Agent, Project, Session, Task } from '@/api/client'
import * as THREE from 'three'
import { X, Clock, GitBranch, FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ─── Assets ──────────────────────────────────────────────────────────────────

const F = '/kaykit/KayKit_Furniture_Bits_1.0_EXTRA/Assets/gltf/'
const A = '/kaykit/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/'

// Desk furniture
const DESK    = F + 'desk.gltf'
const CHAIR   = F + 'chair_desk_A.gltf'
const MONITOR = F + 'monitor.gltf'

// Character rigs
const RIG_SIM   = A + 'Rig_Medium_Simulation.glb'
const RIG_MOVE  = A + 'Rig_Medium_MovementBasic.glb'
const RIG_GEN   = A + 'Rig_Medium_General.glb'
const RIG_TOOLS = A + 'Rig_Medium_Tools.glb'

// Mannequin_Medium.glb is the proper base mesh — it has the embedded texture
// that the Rig files omit. Bone names are identical so animations cross-apply.
const MANNEQUIN = '/kaykit/KayKit_Character_Animations_1.1/Mannequin%20Character/characters/Mannequin_Medium.glb'

;[DESK, CHAIR, MONITOR,
  MANNEQUIN, RIG_SIM, RIG_MOVE, RIG_GEN, RIG_TOOLS,
].forEach(u => useGLTF.preload(u))

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  running: '#35bb78', waiting: '#d49e40', done: '#ff6b35',
  error: '#ec6b5c', idle: '#7a7770', merged: '#aca89f',
}
const STATUS_LABEL: Record<string, string> = {
  running: 'Working', waiting: 'Waiting', done: 'Done',
  error: 'Error', idle: 'Idle', merged: 'Merged',
}

// ─── Desk grid ────────────────────────────────────────────────────────────────

const DESK_SPACING = 5.0

function deskPosition(index: number, total: number): THREE.Vector3 {
  const cols = Math.min(total, 3)
  const col  = index % cols
  const row  = Math.floor(index / cols)
  const rowCount = Math.ceil(total / cols)
  const rowAgents = index < Math.floor(total / cols) * cols ? cols : total % cols || cols
  const x = col * DESK_SPACING - (rowAgents - 1) * DESK_SPACING * 0.5
  const z = row * DESK_SPACING - (rowCount - 1) * DESK_SPACING * 0.5
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

// ─── Walking agent character ──────────────────────────────────────────────────

type AgentState = 'wander' | 'walk_to_desk' | 'sit' | 'leave_desk'

function WalkingAgent({
  agent, session, deskPos, bounds, isSelected, onSelect,
  followRef, selectedIdRef, walkSpeed, wanderSpeed,
}: {
  agent: Agent; session?: Session
  deskPos: THREE.Vector3; bounds: number
  isSelected: boolean; onSelect: () => void
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  selectedIdRef: React.MutableRefObject<string | null>
  walkSpeed: number; wanderSpeed: number
}) {
  const groupRef   = useRef<THREE.Group>(null)
  const rigRef     = useRef<THREE.Group>(null)
  const pos        = useRef(new THREE.Vector3(
    (Math.random() - 0.5) * bounds,
    0,
    (Math.random() - 0.5) * bounds,
  ))
  const target     = useRef(new THREE.Vector3())
  const stateRef   = useRef<AgentState>('wander')
  const nextPickAt = useRef(0)
  const curAnim    = useRef('')

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
    const a = Math.random() * Math.PI * 2
    const r = bounds * 0.1 + Math.random() * bounds * 0.7
    target.current.set(Math.cos(a) * r, 0, Math.sin(a) * r)
  }

  useEffect(() => {
    pickWanderTarget()
  }, [])

  // Chair is at deskPos + [0, 0, 1.0]; character sits slightly in front at Z+0.65, Y+0.08
  const chairPos = useMemo(
    () => deskPos.clone().add(new THREE.Vector3(0, 0, 0.65)),
    [deskPos],
  )

  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return

    const ARRIVE_DIST = 0.35
    const ROT_SPEED   = dt * 10

    if (isWorking) {
      // ── walk to chair, then sit / work ──────────────
      if (stateRef.current === 'sit') {
        g.position.set(chairPos.x, 0.08, chairPos.z)
        // running agents visibly work at keyboard; waiting agents sit quietly
        const deskAnim = status === 'running'
          ? (animNames.work || animNames.sit || 'Sit_Chair_Idle')
          : (animNames.sit  || 'Sit_Chair_Idle')
        play(deskAnim)
      } else {
        stateRef.current = 'walk_to_desk'
        const dist = pos.current.distanceTo(chairPos)
        if (dist > ARRIVE_DIST) {
          const dir = chairPos.clone().sub(pos.current).normalize()
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
      // ── wander ──────────────────────────────────────
      if (stateRef.current === 'sit' || stateRef.current === 'walk_to_desk') {
        stateRef.current = 'leave_desk'
        pickWanderTarget()
      }
      if (stateRef.current === 'leave_desk') stateRef.current = 'wander'

      const dist = pos.current.distanceTo(target.current)
      if (dist < ARRIVE_DIST || Date.now() > nextPickAt.current) {
        if (Math.random() < 0.4) {
          play(animNames.idle || 'Idle_A')
          nextPickAt.current = Date.now() + 1500 + Math.random() * 3000
        } else {
          pickWanderTarget()
          nextPickAt.current = Date.now() + 4000 + Math.random() * 6000
        }
      } else {
        const dir = target.current.clone().sub(pos.current).normalize()
        pos.current.addScaledVector(dir, dt * wanderSpeed)
        const targetAngle = Math.atan2(dir.x, dir.z)
        g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetAngle, ROT_SPEED)
        play(animNames.walk || 'Idle_A')
      }
      g.position.set(pos.current.x, 0, pos.current.z)
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
            background: isSelected ? `${color}22` : 'rgba(14,13,11,0.88)',
            color: isSelected ? color : '#c8c3ba',
            border: `1px solid ${isSelected ? color + '55' : 'rgba(255,255,255,0.09)'}`,
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

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  agentList, sessionList, selectedId, onSelect, followRef, selectedIdRef,
  onFloorPanStart, walkSpeed, wanderSpeed, bounds,
}: {
  agentList: Agent[]; sessionList: Session[]
  selectedId: string | null; onSelect: (id: string | null) => void
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  selectedIdRef: React.MutableRefObject<string | null>
  onFloorPanStart: (x: number, y: number) => void
  walkSpeed: number; wanderSpeed: number; bounds: number
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

  return (
    <>
      <color attach="background" args={['#090908']} />
      <fog attach="fog" args={['#090908', 20, 38]} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 14, 8]}  intensity={1.2} castShadow />
      <directionalLight position={[-6, 8, -4]} intensity={0.35} color="#ffe8d6" />
      <pointLight position={[0, 6, -8]} intensity={0.6} color="#ffd6a0" distance={18} decay={2} />
      <Environment preset="night" />

      {/* Ground grid */}
      <Grid
        position={[0, 0, 0]}
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#1a1a18"
        sectionSize={5}
        sectionThickness={1.0}
        sectionColor="#272724"
        fadeDistance={30}
        fadeStrength={2.5}
        infiniteGrid
      />
      <mesh
        position={[0, -0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          onFloorPanStart(e.nativeEvent.clientX, e.nativeEvent.clientY)
        }}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

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
          />
        </Suspense>
      ))}
    </>
  )
}

// ─── Camera ──────────────────────────────────────────────────────────────────

function LabCamera({ followRef, panRef, freeCamera }: {
  followRef: React.MutableRefObject<THREE.Vector3 | null>
  panRef: React.MutableRefObject<THREE.Vector3>
  freeCamera: boolean
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const { camera } = useThree()
  const defaultTarget = useMemo(() => new THREE.Vector3(0, 0.5, 0), [])

  useFrame((_, dt) => {
    const controls = controlsRef.current
    if (!controls) return

    if (freeCamera) {
      controls.update()
      return
    }

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

function AgentCard({ agent, session, project, task, onClose }: {
  agent: Agent; session?: Session; project?: Project; task?: Task; onClose: () => void
}) {
  const navigate = useNavigate()
  const status = session?.status ?? 'idle'
  const color  = STATUS_COLOR[status]

  return (
    <div
      className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[420px] pointer-events-auto"
      style={{ zIndex: 20 }}
    >
      <div
        className="rounded-2xl p-5 flex flex-col gap-4"
        style={{
          background: 'rgba(16,14,12,0.95)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-[var(--foreground)]">{agent.name}</span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
            >
              {STATUS_LABEL[status]}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Task block */}
        {task ? (
          <button
            type="button"
            onClick={() => navigate(`/projects/${task.projectId}/tasks/${task.id}`)}
            className="text-left rounded-xl px-4 py-3 transition-colors hover:bg-white/[0.05] group"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Current task</div>
            <div className="text-sm font-medium text-[var(--foreground)] line-clamp-2 group-hover:text-white transition-colors">
              {task.title}
            </div>
            {project && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                <FolderOpen size={10} />
                <span className="truncate">{project.name}</span>
              </div>
            )}
          </button>
        ) : (
          <div className="text-xs text-[var(--muted-foreground)] px-1">No active task</div>
        )}

        {/* Meta + actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
            {session?.branch && (
              <span className="flex items-center gap-1 font-mono">
                <GitBranch size={10} />
                {session.branch}
              </span>
            )}
            {session?.createdAt && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {new Date(session.createdAt).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/agents/${agent.id}`)}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
            >
              Agent
            </button>
            {session && (
              <button
                onClick={() => navigate(`/sessions/${session.id}`)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80"
                style={{ background: color, color: '#fff' }}
              >
                Open session →
              </button>
            )}
          </div>
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

export default function OfficeBg({ active }: { active: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const followRef = useRef<THREE.Vector3 | null>(null)
  const panRef = useRef(new THREE.Vector3())
  const selectedIdRef = useRef<string | null>(null)
  const dragRef = useRef({ active: false, moved: false, x: 0, y: 0 })
  const [freeCamera, setFreeCamera] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const qc = useQueryClient()

  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],          queryFn: agentsApi.list })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions', 'lab'], queryFn: () => sessionsApi.list(), refetchInterval: 30_000 })
  const { data: projectList = [] } = useQuery({ queryKey: ['projects'],        queryFn: projectsApi.list })
  const { data: taskList    = [] } = useQuery({ queryKey: ['tasks'],           queryFn: () => tasksApi.list(), refetchInterval: 30_000 })

  const { walkSpeed, wanderSpeed, bounds } = useControls('Movement', {
    walkSpeed:   { value: 2.5, min: 0.5, max: 6,  step: 0.1, label: 'Walk Speed' },
    wanderSpeed: { value: 1.8, min: 0.3, max: 4,  step: 0.1, label: 'Wander Speed' },
    bounds:      { value: 10,  min: 4,   max: 25, step: 1,   label: 'Wander Bounds' },
  }, { collapsed: true })

  // WebSocket live updates
  useEffect(() => {
    let ws: WebSocket | null = null, dead = false, delay = 1000
    function connect() {
      if (dead) return
      const token = localStorage.getItem('token')
      if (!token) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)
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
    setSelectedId(id)
    selectedIdRef.current = id
    if (!id) followRef.current = null
  }

  function startFloorPan(x: number, y: number) {
    if (!active || freeCamera) return
    dragRef.current = { active: true, moved: false, x, y }
    setIsPanning(true)
    selectAgent(null)
  }

  function handlePanMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag.active || freeCamera) return

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
      <Leva hidden />

      {/* 3D canvas */}
      <div
        className={cn(
          'absolute inset-0',
          active && !freeCamera && (isPanning ? 'cursor-grabbing' : 'cursor-grab'),
        )}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
      >
        <Canvas
          camera={{ position: [0, 15, 11], fov: 45 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
          onClick={() => {
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
            />
          </Suspense>
          <LabCamera followRef={followRef} panRef={panRef} freeCamera={freeCamera} />
        </Canvas>
      </div>

      {/* Dim overlay when backgrounded */}
      {!active && <div className="absolute inset-0 bg-black/50" />}

      {/* Active office UI */}
      {active && (
        <>
          <OfficeHud agentList={agentList} sessionList={sessionList} />

          <div className="absolute right-4 top-16 z-20">
            <button
              type="button"
              onClick={() => setFreeCamera(v => !v)}
              className="h-9 rounded-lg border border-border bg-card/95 px-3 text-xs font-medium text-foreground shadow-lg backdrop-blur-xl transition-colors hover:bg-accent"
            >
              {freeCamera ? 'Guided' : 'Free camera'}
            </button>
          </div>

          {selectedAgent && (
            <AgentCard
              agent={selectedAgent}
              session={selectedSession}
              project={selectedProject}
              task={selectedTask}
              onClose={() => selectAgent(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
