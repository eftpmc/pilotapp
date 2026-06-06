import { Suspense, useRef, useMemo, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, Html, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useControls, Leva } from 'leva'
import { agents, sessions } from '@/api/client'
import type { Agent, Session } from '@/api/client'
import * as THREE from 'three'

// ─── Asset paths ─────────────────────────────────────────────────────────────

const F = '/kaykit/KayKit_Furniture_Bits_1.0_EXTRA/Assets/gltf/'
const P = '/kaykit/KayKit_Prototype_Bits_1.1_EXTRA/Assets/gltf/'
const A = '/kaykit/KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/'

const DESK      = F + 'desk.gltf'
const CHAIR     = F + 'chair_desk_A.gltf'
const MONITOR   = F + 'monitor.gltf'
const KEYBOARD  = F + 'keyboard.gltf'
const MUG       = F + 'mug_A.gltf'
const LAMP      = F + 'lamp_desk_headphones.gltf'
const RUG       = F + 'rug_rectangle_stripes_A.gltf'
const SHELF     = F + 'shelf_B_small_decorated.gltf'
const CACTUS_M  = F + 'cactus_medium_A.gltf'
const CACTUS_S  = F + 'cactus_small_A.gltf'

const WALL_WIN  = P + 'Wall_Window_Open.gltf'
const WALL      = P + 'Wall.gltf'
const FLOOR_T   = P + 'Floor.gltf'

const RIG_SIM   = A + 'Rig_Medium_Simulation.glb'

;[DESK, CHAIR, MONITOR, KEYBOARD, LAMP, RUG, SHELF, CACTUS_M, CACTUS_S,
  WALL_WIN, WALL, FLOOR_T, RIG_SIM].forEach(url => useGLTF.preload(url))

// ─── Status ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  running: '#22c55e',
  waiting: '#f59e0b',
  done:    '#3b82f6',
  error:   '#ef4444',
  idle:    '#475569',
  merged:  '#8b5cf6',
}

const STATUS_ANIM: Record<string, string> = {
  running: 'Sit_Chair_Idle',
  waiting: 'Sit_Chair_Idle',
  done:    'Cheering',
  error:   'Sit_Chair_Idle',
  idle:    'Sit_Chair_Idle',
  merged:  'Waving',
}

// ─── Shared model clone ───────────────────────────────────────────────────────

function Model({ url, scale = 1, position = [0,0,0] as [n,n,n], rotation = [0,0,0] as [n,n,n] }: {
  url: string; scale?: number
  position?: [number,number,number]; rotation?: [number,number,number]
}) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => scene.clone(true), [scene])
  return <primitive object={clone} scale={scale} position={position} rotation={rotation} />
}
type n = number

// ─── Status orb ──────────────────────────────────────────────────────────────

function StatusOrb({ status }: { status: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  useFrame(() => {
    if (!ref.current) return
    ref.current.position.y = 2.2 + Math.sin(Date.now() * 0.0025) * 0.07
    if (status === 'running') ref.current.scale.setScalar(1 + Math.sin(Date.now() * 0.004) * 0.18)
  })
  return (
    <mesh ref={ref} position={[0, 2.2, 0]}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial color={color} emissive={color}
        emissiveIntensity={status === 'running' ? 3 : 1.2} toneMapped={false} />
    </mesh>
  )
}

// ─── Screen glow ─────────────────────────────────────────────────────────────

function ScreenGlow({ status, monZ }: { status: string; monZ: number }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.idle
  const intensity = status === 'running' ? 1.2 : status === 'waiting' ? 0.5 : 0.15
  return (
    <pointLight
      position={[0, 1.2, monZ + 0.35]}
      color={color}
      intensity={intensity}
      distance={2.5}
      decay={2}
    />
  )
}

// ─── Sitting character ────────────────────────────────────────────────────────

function AgentCharacter({ status, charY, charZ }: { status: string; charY: number; charZ: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF(RIG_SIM)
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { actions } = useAnimations(animations, groupRef)

  useEffect(() => {
    if (!actions) return
    const pick = STATUS_ANIM[status] ?? 'Sit_Chair_Idle'
    if (!actions[pick]) return
    Object.values(actions).forEach(a => a?.fadeOut(0.3))
    actions[pick]?.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.3).play()
  }, [actions, status])

  return (
    <group ref={groupRef} position={[0, charY, charZ]} rotation={[0, Math.PI, 0]} scale={0.9}>
      <primitive object={clone} />
    </group>
  )
}

// ─── Workstation ─────────────────────────────────────────────────────────────

const SPACING = 4.5

function Workstation({ agent, session, col, row, agentsInRow, onClick }: {
  agent: Agent; session?: Session
  col: number; row: number; colCount: number; agentsInRow: number
  onClick: () => void
}) {
  const x = col * SPACING - (agentsInRow - 1) * SPACING * 0.5
  const z = row * SPACING
  const status = session?.status ?? 'idle'

  const { charY, charZ, monY, monZ, chairZ, lampX, rugScale } = useControls('Workstation', {
    charY:    { value: 0.08,  min: -0.3, max: 0.5,  step: 0.01, label: 'Char Y' },
    charZ:    { value: 0.65,  min: 0,    max: 1.5,  step: 0.01, label: 'Char Z' },
    monY:     { value: 0.95,  min: 0.5,  max: 1.5,  step: 0.01, label: 'Monitor Y' },
    monZ:     { value: -0.28, min: -0.8, max: 0,    step: 0.01, label: 'Monitor Z' },
    chairZ:   { value: 1.0,   min: 0.5,  max: 1.8,  step: 0.01, label: 'Chair Z' },
    lampX:    { value: 0.42,  min: -0.6, max: 0.6,  step: 0.01, label: 'Lamp X' },
    rugScale: { value: 1.1,   min: 0.5,  max: 2.5,  step: 0.05, label: 'Rug Scale' },
  }, { collapsed: true })

  return (
    <group position={[x, 0, z]}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = 'default' }}
    >
      {/* Rug */}
      <Model url={RUG} position={[0, 0.01, 0.6]} scale={rugScale} />
      {/* Desk */}
      <Model url={DESK} />
      {/* Chair */}
      <Model url={CHAIR} position={[0, 0, chairZ]} rotation={[0, Math.PI, 0]} />
      {/* Monitor */}
      <Model url={MONITOR} position={[0, monY, monZ]} />
      {/* Keyboard */}
      <Model url={KEYBOARD} position={[0, 0.78, 0.1]} />
      {/* Desk lamp */}
      <Model url={LAMP} position={[lampX, 0.78, monZ + 0.05]} />
      {/* Coffee mug for active agents */}
      {status !== 'idle' && <Model url={MUG} position={[-lampX, 0.78, -0.12]} />}
      {/* Screen glow */}
      <ScreenGlow status={status} monZ={monZ} />
      {/* Character */}
      <Suspense fallback={null}>
        <AgentCharacter status={status} charY={charY} charZ={charZ} />
      </Suspense>
      {/* Status orb */}
      <StatusOrb status={status} />
      {/* Name label */}
      <Html position={[0, 2.55, 0]} center distanceFactor={12}>
        <div
          className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap pointer-events-none select-none"
          style={{
            background: 'rgba(8,12,20,0.88)',
            color: STATUS_COLOR[status] ?? '#94a3b8',
            border: `1px solid ${STATUS_COLOR[status] ?? '#334155'}60`,
            backdropFilter: 'blur(8px)',
            letterSpacing: '0.03em',
          }}
        >
          {agent.name}
        </div>
      </Html>
    </group>
  )
}

// ─── Room ─────────────────────────────────────────────────────────────────────

function Room({ cols, rows }: { cols: number; rows: number }) {
  const { wallZ, wallY, floorTiles } = useControls('Room', {
    wallZ:      { value: -2.8, min: -6, max: 0,   step: 0.1, label: 'Back Wall Z' },
    wallY:      { value: 0,    min: -1, max: 1,    step: 0.1, label: 'Wall Y' },
    floorTiles: { value: true,                                 label: 'Floor Tiles' },
  }, { collapsed: true })

  const roomW = cols * SPACING + 4
  const roomD = rows * SPACING + 4
  const cz    = (rows - 1) * SPACING * 0.5

  // Back wall — alternating windows and solid, centered on scene
  const wallCount = Math.ceil(roomW) + 2
  const wallStart = -(wallCount / 2)

  // Floor tile grid
  const tileCount = floorTiles ? Math.ceil(roomW) + 2 : 0
  const tileDepth = Math.ceil(roomD) + 2

  return (
    <group>
      {/* Base floor plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, cz]}>
        <planeGeometry args={[roomW + 6, roomD + 6]} />
        <meshStandardMaterial color="#0d1117" roughness={0.98} />
      </mesh>

      {/* Floor tile grid */}
      {floorTiles && Array.from({ length: tileCount }, (_, i) =>
        Array.from({ length: tileDepth }, (_, j) => (
          <Model
            key={`f-${i}-${j}`}
            url={FLOOR_T}
            position={[wallStart + i + 0.5, 0, cz - tileDepth / 2 + j + 0.5]}
          />
        ))
      )}

      {/* Back wall */}
      {Array.from({ length: wallCount }, (_, i) => (
        <Model
          key={`w-${i}`}
          url={i % 3 === 1 ? WALL_WIN : WALL}
          position={[wallStart + i + 0.5, wallY, wallZ]}
          rotation={[0, Math.PI, 0]}
        />
      ))}

      {/* Corner cactus left */}
      <Model url={CACTUS_M} position={[-(roomW / 2) + 0.5, 0, wallZ + 0.3]} />
      {/* Corner cactus right */}
      <Model url={CACTUS_M} position={[roomW / 2 - 0.5, 0, wallZ + 0.3]} />
      {/* Small cactus mid-back */}
      {cols > 1 && <Model url={CACTUS_S} position={[0, 0, wallZ + 0.4]} />}

      {/* Shelf on back wall — between desk rows if 2+ rows */}
      {rows >= 2 && (
        <Model url={SHELF} position={[-(roomW / 2) + 0.8, 0, wallZ + 0.15]} rotation={[0, Math.PI / 2, 0]} />
      )}
    </group>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({ agentList, sessionList, onWorkstationClick }: {
  agentList: Agent[]
  sessionList: Session[]
  onWorkstationClick: (agent: Agent, session?: Session) => void
}) {
  const cols = Math.min(Math.ceil(agentList.length / 2) || 1, 4)
  const rows = Math.ceil(agentList.length / cols)

  const activeByAgent = useMemo(() => {
    const map = new Map<string, Session>()
    for (const s of sessionList) {
      if (s.status === 'running' || s.status === 'waiting') map.set(s.agentId, s)
    }
    for (const s of sessionList) {
      if (!map.has(s.agentId) && (s.status === 'done' || s.status === 'error')) map.set(s.agentId, s)
    }
    return map
  }, [sessionList])

  return (
    <>
      <color attach="background" args={['#060a12']} />
      <fog attach="fog" args={['#060a12', 20, 45]} />

      <ambientLight intensity={0.25} />
      <directionalLight position={[4, 10, 6]} intensity={0.9} castShadow />
      <pointLight position={[-6, 6, -2]} intensity={0.6} color="#6366f1" />
      <pointLight position={[6, 4, 10]} intensity={0.4} color="#0ea5e9" />
      <Environment preset="night" />

      <Room cols={cols} rows={rows} />

      {agentList.map((agent, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        const rowStart = row * cols
        const agentsInRow = Math.min(cols, agentList.length - rowStart)
        const session = activeByAgent.get(agent.id)
        return (
          <Workstation
            key={agent.id}
            agent={agent}
            session={session}
            col={col}
            row={row}
            colCount={cols}
            agentsInRow={agentsInRow}
            onClick={() => onWorkstationClick(agent, session)}
          />
        )
      })}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfficePage() {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const { data: agentList   = [] } = useQuery({ queryKey: ['agents'],         queryFn: agents.list })
  const { data: sessionList = [] } = useQuery({ queryKey: ['sessions', 'office'], queryFn: () => sessions.list(), refetchInterval: 30_000 })

  // Live updates via WebSocket
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
        try {
          if (JSON.parse(e.data).type === 'global-event') {
            qc.invalidateQueries({ queryKey: ['sessions', 'office'] })
          }
        } catch {}
      }
      ws.onclose = () => { if (!dead) { setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000) } }
      ws.onerror  = () => ws?.close()
    }
    connect()
    return () => { dead = true; ws?.close() }
  }, [qc])

  function handleWorkstationClick(agent: Agent, session?: Session) {
    if (session) navigate(`/sessions/${session.id}`)
    else navigate(`/agents/${agent.id}`)
  }

  const cols = Math.min(Math.ceil(agentList.length / 2) || 1, 4)
  const rows = Math.ceil(agentList.length / cols)
  const cz   = (rows - 1) * SPACING * 0.5

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100vh - 112px)' }}>
      {/* Leva panel — drag to tune positions, then copy final values into code */}
      <Leva collapsed />

      <Canvas
        shadows
        camera={{ position: [1, 10, 18], fov: 50 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <Suspense fallback={null}>
          <Scene
            agentList={agentList}
            sessionList={sessionList}
            onWorkstationClick={handleWorkstationClick}
          />
        </Suspense>
        <OrbitControls
          target={[0, 1.0, cz]}
          minPolarAngle={Math.PI / 8}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={4}
          maxDistance={40}
          enablePan
        />
      </Canvas>

      <div className="absolute top-4 left-4 pointer-events-none">
        <p className="text-xs text-[var(--muted-foreground)]">{agentList.length} agents</p>
      </div>

      <div className="absolute bottom-4 left-4 flex items-center gap-4 pointer-events-none">
        {(['running','waiting','done','error','idle'] as const).map(k => (
          <div key={k} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0"
              style={{ background: STATUS_COLOR[k], boxShadow: `0 0 5px ${STATUS_COLOR[k]}` }} />
            <span className="text-[11px] text-[var(--muted-foreground)] capitalize">{
              k === 'running' ? 'Working' : k === 'waiting' ? 'Waiting' :
              k === 'done' ? 'Done' : k === 'error' ? 'Error' : 'Idle'
            }</span>
          </div>
        ))}
      </div>
    </div>
  )
}
