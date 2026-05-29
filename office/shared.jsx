/* shared.jsx — design tokens, sample data, and the pixel Sprite component.
   Exported to window for the per-direction files to consume. */

const T = {
  bg:      '#F2F2F7',
  card:    '#FFFFFF',
  surface: '#F2F2F7',
  surface2:'#E7E7EC',
  border:  'rgba(60,60,67,0.15)',
  text:    '#1C1C1E',
  muted:   'rgba(60,60,67,0.62)',
  faint:   'rgba(60,60,67,0.34)',
  claude:  '#F0820B',
  codex:   '#0A84FF',
  green:   '#34C759',
  danger:  '#FF3B30',
  amber:   '#FF9500',
  tint:    '#0A84FF',
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};

const PROVIDER = {
  claude: { label: 'Claude', color: T.claude, model: 'claude code' },
  codex:  { label: 'Codex',  color: T.codex,  model: 'codex cli' },
};

const STATUS = {
  running: { label: 'Working',  color: T.green,  dot: T.green },
  idle:    { label: 'Idle',     color: T.muted,  dot: T.faint },
  done:    { label: 'Ready',    color: T.green,  dot: T.green },
  error:   { label: 'Needs you',color: T.danger, dot: T.danger },
};

// 6 agents — a believable mid-morning floor: 3 working, 1 idle, 1 done, 1 stuck.
const AGENTS = [
  { id:'s1', name:'Atlas',  provider:'claude', status:'running',
    project:'web-app',     branch:'feat/auth-middleware',  task:'Refactor auth middleware',
    line:'Editing src/middleware/auth.ts', elapsed:'4m 12s', add:127, del:34, prog:0.62, files:6, seat:0 },
  { id:'s2', name:'Bishop', provider:'codex',  status:'running',
    project:'api-gateway', branch:'feat/rate-limit',       task:'Add request rate limiter',
    line:'Running tests — 18 / 24 passing', elapsed:'2m 38s', add:64, del:8, prog:0.41, files:3, seat:1 },
  { id:'s3', name:'Cleo',   provider:'claude', status:'idle',
    project:null,          branch:null,                    task:'Awaiting assignment',
    line:'Idle at desk', elapsed:null, add:0, del:0, prog:0, files:0, seat:2 },
  { id:'s4', name:'Dex',    provider:'codex',  status:'done',
    project:'web-app',     branch:'fix/e2e-flake',         task:'Fix flaky e2e test',
    line:'Finished — ready to merge', elapsed:'6m 01s', add:12, del:9, prog:1, files:2, seat:3 },
  { id:'s5', name:'Echo',   provider:'claude', status:'error',
    project:'core-db',     branch:'chore/schema-migrate',  task:'Migrate DB schema',
    line:'Migration conflict on users table', elapsed:'1m 47s', add:38, del:51, prog:0.3, files:4, seat:4 },
  { id:'s6', name:'Fern',   provider:'codex',  status:'running',
    project:'docs-site',   branch:'docs/api-reference',    task:'Generate API reference',
    line:'Writing docs/api/auth.md', elapsed:'1m 05s', add:210, del:2, prog:0.78, files:9, seat:5 },
];

// Pending queue used by a couple of directions
const QUEUE = [
  { id:'q1', title:'Add dark-mode toggle to settings', project:'web-app',  role:'any' },
  { id:'q2', title:'Cache GitHub repo list',            project:'api-gateway', role:'codex' },
  { id:'q3', title:'Write unit tests for parser',       project:'core-db',  role:'claude' },
];

// per-agent identity tint (drives the headshot outfit + avatar backdrop)
const AGENT_TINT = { Atlas:'#5E5CE6', Bishop:'#30B0C7', Cleo:'#FF2D55', Dex:'#34C759', Echo:'#FF9F0A', Fern:'#BF5AF2', Gil:'#64D2FF' };
AGENTS.forEach(a => { a.tint = AGENT_TINT[a.name]; });
function faceUrl(a){ return `office/face_${a.face || a.name.toLowerCase()}.png`; }

/* ---- Pixel character sprite -------------------------------------------- */
// idle  = office/sprite_<p>_idle.png  (32x44, front-facing)
// work  = office/sprite_<p>_work.png  (128x44, 4-frame side typing loop)
function Sprite({ provider, status, scale = 3, walking = false, flip = false, style }) {
  const working = status === 'running';
  const [f, setF] = React.useState(0);
  React.useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setF(p => (p + 1) % 4), 130);
    return () => clearInterval(id);
  }, [working]);

  const w = 32 * scale, h = 44 * scale;
  const base = {
    width: w, height: h, imageRendering: 'pixelated',
    backgroundRepeat: 'no-repeat',
    transform: flip ? 'scaleX(-1)' : undefined,
    ...style,
  };

  if (working) {
    return (
      <div style={{
        ...base,
        backgroundImage: `url(office/sprite_${provider}_work.png)`,
        backgroundSize: `${w * 4}px ${h}px`,
        backgroundPositionX: `${-f * w}px`,
      }} />
    );
  }

  const anim = status === 'error' ? 'sprShake 0.5s ease-in-out infinite'
             : status === 'done'  ? 'sprBob 1.1s ease-in-out infinite'
             : walking            ? 'sprWalk 0.42s steps(2) infinite'
             :                      'sprBreathe 2.6s ease-in-out infinite';
  return (
    <div style={{
      ...base,
      backgroundImage: `url(office/sprite_${provider}_idle.png)`,
      backgroundSize: `${w}px ${h}px`,
      animation: anim,
    }} />
  );
}

/* shared app chrome: top bar with wordmark + clickable nav + right-side actions */
const NAV = ['Office', 'Agents', 'Projects', 'Settings'];
function Shell({ tab = 'Office', onNav, actions, children }) {
  return (
    <div style={{ width:'100%', height:'100%', background:T.bg, fontFamily:T.sans, color:T.text, display:'flex', flexDirection:'column', position:'relative' }}>
      <header style={{ height:54, background:'#FFFFFF', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:20, padding:'0 22px', flex:'0 0 auto' }}>
        <span style={{ fontFamily:T.mono, fontWeight:700, fontSize:15 }}>pilot</span>
        <nav style={{ display:'flex', gap:3 }}>
          {NAV.map(n => (
            <button key={n} onClick={() => onNav && onNav(n)} style={{ fontFamily:T.sans, fontSize:13, fontWeight:n===tab?600:500,
              color:n===tab?T.text:T.muted, background:n===tab?T.surface2:'transparent', border:'none', padding:'5px 11px', borderRadius:8, cursor:'pointer' }}>{n}</button>
          ))}
        </nav>
        <div style={{ flex:1 }} />
        {actions}
      </header>
      {children}
    </div>
  );
}

/* per-agent pixel headshot in a soft tinted tile */
function Headshot({ agent, size = 40, radius = 10 }) {
  const tint = (agent && agent.tint) || (agent && PROVIDER[agent.provider] && PROVIDER[agent.provider].color) || T.muted;
  return (
    <div style={{ width:size, height:size, borderRadius:radius, background:tint+'24',
      border:`1px solid ${T.border}`, overflow:'hidden', flex:'0 0 auto', position:'relative',
      display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <img src={faceUrl(agent)} alt={agent.name} draggable="false"
        style={{ width:'88%', imageRendering:'pixelated', display:'block', marginBottom:'-1px' }} />
    </div>
  );
}

/* small reusable bits */
function StatusDot({ status, size = 7 }) {
  const c = STATUS[status].dot;
  const live = status === 'running';
  return (
    <span style={{ position:'relative', width:size, height:size, flex:'0 0 auto', display:'inline-block' }}>
      {live && <span style={{ position:'absolute', inset:-3, borderRadius:'50%', background:c, opacity:.25, animation:'pulse 1.6s ease-out infinite' }} />}
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:c }} />
    </span>
  );
}

function Diff({ add, del, mono = T.mono }) {
  if (!add && !del) return null;
  return (
    <span style={{ fontFamily:mono, fontSize:11, letterSpacing:'-0.02em' }}>
      <span style={{ color:T.green }}>+{add}</span>{' '}
      <span style={{ color:T.danger }}>−{del}</span>
    </span>
  );
}

Object.assign(window, { T, PROVIDER, STATUS, AGENTS, QUEUE, AGENT_TINT, NAV, faceUrl, Sprite, Headshot, Shell, StatusDot, Diff });
