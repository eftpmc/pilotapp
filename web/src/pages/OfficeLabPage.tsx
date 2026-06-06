import { Suspense, useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls, Html, useAnimations, Grid, Environment } from '@react-three/drei'
import { SkeletonUtils, type OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Leva, useControls } from 'leva'
import { agents as agentsApi, projects as projectsApi, sessions as sessionsApi, tasks as tasksApi } from '@/api/client'
import type { Agent, Project, Session, Task } from '@/api/client'
import * as THREE from 'three'
import { X, ArrowUpRight, Clock, GitBranch, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── Assets ──────────────────────────────────────────────────────────────────

const F = '/kaykit/KayKit_Furniture_Bits_1.0_EXTRA/Assets/gltf/'
const A = '/kaykit/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/'

const DESK     = F + 'desk.gltf'
const CHAIR    = F + 'chair_desk_A.gltf'
const MONITOR  = F + 'monitor.gltf'
const KEYBOARD = F + 'keyboard.gltf'

const RIG_SIM  = A + 'Rig_Medium_Simulation.glb'
const RIG_MOVE = A + 'Rig_Medium_MovementBasic.glb'
const RIG_GEN  = A + 'Rig_Medium_General.glb'

// Mannequin_Medium.glb is the proper base mesh — it has the embedded texture
// that the Rig files omit. Bone names are identical so animations cross-apply.
const MANNEQUIN = '/kaykit/KayKit_Character_Animations_1.1/Mannequin%20Character/characters/Mannequin_Medium.glb'

;[DESK, CHAIR, MONITOR, KEYBOARD, MANNEQUIN, RIG_SIM, RIG_MOVE, RIG_GEN].forEach(u => useGLTF.preload(u))

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  running: '#22c55e', waiting: '#f59e0b', done: '#3b82f6',
  error: '#ef4444', idle: '#94a3b8', merged: '#8b5cf6',
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
    <group position={worldPos.toArray()}>
      <Model url={DESK} />
      <Model url={CHAIR}    position={[0, 0,     1.0]}  rotation={[0, Math.PI, 0]} />
      <Model url={MONITOR}  position={[0, 0.95, -0.28]} />
      <Model url={KEYBOARD} position={[0, 0.78,  0.1]}  />
      <ScreenGlow status={status} />
    </group>
  )
}

// ─── Walking agent character ──────────────────────────────────────────────────

type AgentState = 'wander' | 'walk_to_desk' | 'sit' | 'leave_desk'

function WalkingAgent({
  agent, session, deskPos, bounds, isSelected, onSelect, walkSpeed, wanderSpeed,
}: {
  agent: Agent; session?: Session
  deskPos: THREE.Vector3; bounds: number
  isSelected: boolean; onSelect: (position: THREE.Vector3) => void
  walkSpeed: number; wanderSpeed: number
}) {
  const groupRef   = useRef<THREE.Group>(null)
  const rigRef     = useRef<THREE.Group>(null)
  const posRef     = useRef(() => {
    // start scattered around the scene
    const a = Math.random() * Math.PI * 2
    const r = bounds * 0.3 + Math.random() * bounds * 0.4
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)
  })
  const pos        = useRef(posRef.current())
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

  const clone    = useMemo(() => SkeletonUtils.clone(mannequinScene), [mannequinScene])
  const allAnims = useMemo(
    () => [...simAnims, ...moveAnims, ...genAnims],
    [simAnims, moveAnims, genAnims],
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
      walk:    find(/^Walking_A$/i, /^Walk$/i, /walking/i, /walk/i),
      run:     find(/^Running_A$/i, /^Run$/i,  /running/i, /run/i),
      idle:    find(/^Idle_A$/i,    /idle_a/i, /idle/i),
      sit:     find(/^Sit_Chair_Idle$/i, /sit_chair/i),
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

  useFrame((_, dt) => {
    const g = groupRef.current
    if (!g) return

    const ARRIVE_DIST  = 0.35
    const ROT_SPEED    = dt * 10

    if (isWorking) {
      // ── walk to desk ────────────────────────────────
      if (stateRef.current === 'sit') {
        play(animNames.sit || 'Sit_Chair_Idle')
      } else {
        stateRef.current = 'walk_to_desk'
        const dist = pos.current.distanceTo(deskPos)
        if (dist > ARRIVE_DIST) {
          const dir = deskPos.clone().sub(pos.current).normalize()
          pos.current.addScaledVector(dir, dt * walkSpeed)
          const targetAngle = Math.atan2(dir.x, dir.z)
          g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetAngle, ROT_SPEED)
          play(animNames.walk || 'Idle_A')
        } else {
          stateRef.current = 'sit'
          g.rotation.y = Math.PI
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
          // pause and idle
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
    }

    g.position.copy(pos.current)
  })

  const color = STATUS_COLOR[status]
  const select = useCallback(() => onSelect(pos.current.clone()), [onSelect])

  return (
    <group
      ref={groupRef}
      onClick={(e) => { e.stopPropagation(); select() }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      <group ref={rigRef}>
        <primitive object={clone} />
      </group>
      {/* Status orb */}
      <StatusOrb status={status} />
      {/* Name + status label */}
      <Html position={[0, 2.4, 0]} center distanceFactor={14} zIndexRange={[10, 0]}>
        <button
          onClick={(e) => { e.stopPropagation(); select() }}
          className="flex flex-col items-center gap-0.5 cursor-pointer group select-none outline-none"
        >
          <div
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all duration-150"
            style={{
              background: isSelected ? `${color}22` : 'rgba(8,12,20,0.82)',
              color: isSelected ? color : '#e2e8f0',
              border: `1px solid ${isSelected ? color : '#1e293b'}`,
              backdropFilter: 'blur(10px)',
              boxShadow: isSelected ? `0 0 12px ${color}40` : 'none',
              letterSpacing: '0.02em',
            }}
          >
            {agent.name}
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span className="text-[9px]" style={{ color: `${color}cc` }}>
              {STATUS_LABEL[status] ?? status}
            </span>
          </div>
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
  agentList, sessionList, selectedId, onSelect,
  walkSpeed, wanderSpeed, bounds,
}: {
  agentList: Agent[]; sessionList: Session[]
  selectedId: string | null; onSelect: (id: string | null, position?: THREE.Vector3) => void
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
      <color attach="background" args={['#07080d']} />
      <fog attach="fog" args={['#07080d', 18, 45]} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 14, 8]}  intensity={1.2} castShadow />
      <directionalLight position={[-6, 8, -4]} intensity={0.4} color="#c8d8ff" />
      <Environment preset="night" />


      {/* Ground grid */}
      <Grid
        position={[0, 0, 0]}
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#0f172a"
        sectionSize={5}
        sectionThickness={0.6}
        sectionColor="#1e293b"
        fadeDistance={35}
        fadeStrength={2}
        infiniteGrid
      />

      {/* Desks — only rendered when agent has active work */}
      {agentList.map((agent, i) => {
        const session = activeByAgent.get(agent.id)
        const isWorking = session?.status === 'running' || session?.status === 'waiting'
        if (!isWorking) return null
        return (
          <Suspense key={agent.id} fallback={null}>
            <WorkDesk worldPos={deskPositions[i]} status={session!.status} />
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
            onSelect={(position) => onSelect(selectedId === agent.id ? null : agent.id, position)}
            walkSpeed={walkSpeed}
            wanderSpeed={wanderSpeed}
          />
        </Suspense>
      ))}
    </>
  )
}

// ─── Camera ──────────────────────────────────────────────────────────────────

function LabCamera({ focus, freeCamera }: { focus: THREE.Vector3 | null; freeCamera: boolean }) {
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

    const target = focus ?? defaultTarget
    const lookAt = new THREE.Vector3(target.x, 0.8, target.z)
    const cameraOffset = focus
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

// ─── Session panel ────────────────────────────────────────────────────────────

function SessionPanel({ agent, session, project, task, onClose }: {
  agent: Agent; session?: Session; project?: Project; task?: Task; onClose: () => void
}) {
  const navigate = useNavigate()
  const status = session?.status ?? 'idle'
  const color  = STATUS_COLOR[status]

  return (
    <div className="absolute right-4 top-4 bottom-4 w-72 flex flex-col gap-3 pointer-events-auto"
      style={{ zIndex: 10 }}>
      <div className="rounded-xl p-4 flex flex-col gap-3"
        style={{ background: 'rgba(10,14,26,0.90)', border: '1px solid #1e293b', backdropFilter: 'blur(16px)' }}>
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[var(--foreground)]">{agent.name}</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <span className="text-xs" style={{ color }}>{STATUS_LABEL[status]}</span>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="text-xs text-[var(--muted-foreground)] font-mono">{agent.provider}</div>
      </div>

      {session ? (
        <div className="rounded-xl p-4 flex flex-col gap-3 flex-1 min-h-0"
          style={{ background: 'rgba(10,14,26,0.90)', border: `1px solid ${color}30`, backdropFilter: 'blur(16px)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider">
              Current Session
            </span>
            <button
              onClick={() => navigate(`/sessions/${session.id}`)}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-colors hover:bg-white/5"
              style={{ color }}>
              Open <ArrowUpRight size={11} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {task && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${task.projectId}/tasks/${task.id}`)}
                className="text-left rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2 transition-colors hover:bg-white/[0.045]"
              >
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">Task</div>
                <div className="mt-0.5 text-sm font-medium text-[var(--foreground)] line-clamp-2">{task.title}</div>
              </button>
            )}
            {project && (
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}`)}
                className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              >
                <FolderOpen size={11} />
                <span className="truncate">{project.name}</span>
              </button>
            )}
            {session.branch && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <GitBranch size={11} />
                <span className="font-mono truncate">{session.branch}</span>
              </div>
            )}
            {session.createdAt && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <Clock size={11} />
                <span>{new Date(session.createdAt).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
          <div className="mt-auto pt-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
              <span className="text-xs" style={{ color: `${color}bb` }}>
                {status === 'running' ? 'Agent is working…' :
                 status === 'waiting' ? 'Waiting for response…' :
                 status === 'done'    ? 'Ready to review' :
                 status === 'error'   ? 'Needs attention' : STATUS_LABEL[status]}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'rgba(10,14,26,0.90)', border: '1px solid #1e293b', backdropFilter: 'blur(16px)' }}>
          <span className="text-xs text-[var(--muted-foreground)]">No active session</span>
          <button
            type="button"
            onClick={() => navigate(`/agents/${agent.id}`)}
            className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            View agent <ArrowUpRight size={11} />
          </button>
        </div>
      )}
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

export default function OfficeLabPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cameraFocus, setCameraFocus] = useState<THREE.Vector3 | null>(null)
  const [freeCamera, setFreeCamera] = useState(false)
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

  function selectAgent(id: string | null, position?: THREE.Vector3) {
    setSelectedId(id)
    setCameraFocus(id && position ? position : null)
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-background">
      <Leva hidden />

      {/* 3D canvas — fills entire area */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 15, 11], fov: 45 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
          onClick={() => selectAgent(null)}
          style={{ width: '100%', height: '100%' }}
        >
          <Suspense fallback={null}>
            <Scene
              agentList={agentList}
              sessionList={sessionList}
              selectedId={selectedId}
              onSelect={selectAgent}
              walkSpeed={walkSpeed}
              wanderSpeed={wanderSpeed}
              bounds={bounds}
            />
          </Suspense>
          <LabCamera focus={cameraFocus} freeCamera={freeCamera} />
        </Canvas>
      </div>

      {/* Status pills bottom-left */}
      <OfficeHud agentList={agentList} sessionList={sessionList} />

      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setFreeCamera(v => !v)}>
          {freeCamera ? 'Guided' : 'Free camera'}
        </Button>
      </div>

      {/* Agent panel */}
      {selectedAgent && (
        <SessionPanel
          agent={selectedAgent}
          session={selectedSession}
          project={selectedProject}
          task={selectedTask}
          onClose={() => selectAgent(null)}
        />
      )}
    </div>
  )
}
