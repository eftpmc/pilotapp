/* board.jsx — Direction 3: "Control Room" (interactive)
   A real click-through of the task lifecycle: Queue → Working → Review.
   • Drag a queue task onto a free agent to dispatch it (or hit Assign / Run queue)
   • Sessions stream live output and progress; finished ones move to Review
   • Click any session to open the live drawer (output + diff + merge/discard)
   window.BoardView */

const { T, PROVIDER, STATUS, AGENTS, QUEUE, AGENT_TINT, Sprite, Headshot, Shell, StatusDot, Diff } = window;

/* ---- helpers ----------------------------------------------------------- */
function parseSecs(s){ if(!s) return 0; const m=/(?:(\d+)m)?\s*(\d+)s/.exec(s); return m?(+(m[1]||0))*60+(+m[2]):0; }
function fmtSecs(n){ const m=Math.floor(n/60), s=n%60; return `${m}m ${String(s).padStart(2,'0')}s`; }
function eligible(role, provider){ return role==='any' || role===provider; }
function slug(t){ return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').split('-').slice(0,3).join('-'); }
function bbtn(bg,dark){ return { fontFamily:T.sans, fontSize:11, fontWeight:600, color:dark?'#FFFFFF':T.text, background:bg,
  border:dark?'none':`1px solid ${T.border}`, borderRadius:7, padding:'5px 11px', cursor:'pointer', whiteSpace:'nowrap' }; }

// a deterministic line for tick n of a running session
function streamLine(a, n){
  const file = a.branch ? a.branch.split('/').slice(-1)[0] : 'index';
  const pool = [
    `▸ read ${a.project}/src/`,
    `▸ grep "${file}"`,
    `▸ edit src/${file}.ts`,
    `  applying patch · ${Math.max(1,a.files)} files`,
    `▸ bash "npm test"`,
    `  ✓ 24 passed`,
    `  rethinking approach…`,
    `▸ write src/${file}.test.ts`,
  ];
  return pool[n % pool.length];
}

const SAVE_KEY = 'pilot.office.v1';
function loadSaved(){ try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch(e){ return null; } }
const PROJECTS = ['web-app', 'api-gateway', 'core-db', 'docs-site'];

/* ---- queue + agents ---------------------------------------------------- */
function RoleChip({ role }) {
  const map = { any:{c:T.muted,t:'any'}, claude:{c:T.claude,t:'claude'}, codex:{c:T.codex,t:'codex'} };
  const m = map[role];
  return <span style={{ fontFamily:T.mono, fontSize:9.5, color:m.c, background:m.c+'1a', border:`1px solid ${m.c}33`, padding:'1px 6px', borderRadius:5 }}>{m.t}</span>;
}

function BColHead({ title, count, color }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 4px 11px' }}>
      <span style={{ width:7, height:7, borderRadius:2, background:color }} />
      <span style={{ fontFamily:T.sans, fontSize:13, fontWeight:600, color:T.text }}>{title}</span>
      <span style={{ fontFamily:T.mono, fontSize:11, color:T.faint }}>{count}</span>
    </div>
  );
}

function QueueCard({ q, freeAgents, onDragStart, onDragEnd, onAssign, dragging, over, onOver, onLeave, onDrop }) {
  const canAssign = freeAgents.some(a => eligible(q.role, a.provider));
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      onDragOver={onOver} onDragLeave={onLeave} onDrop={onDrop}
      style={{ background:T.card, border:`1px dashed ${dragging?T.tint:T.border}`, borderRadius:12, padding:'12px 13px',
        display:'flex', flexDirection:'column', gap:9, cursor:'grab', opacity:dragging?0.4:1,
        boxShadow: over ? `0 -3px 0 ${T.tint}` : 'none',
        transition:'border-color .15s, opacity .15s, box-shadow .12s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
        <span style={{ color:T.faint, fontSize:12, marginTop:-1 }}>⠿</span>
        <div style={{ fontFamily:T.sans, fontSize:13, fontWeight:500, lineHeight:1.3, color:T.text }}>{q.title}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:19 }}>
        <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.faint }}>{q.project}</span>
        <RoleChip role={q.role} />
        <div style={{ flex:1 }} />
        <span onClick={canAssign ? onAssign : undefined}
          style={{ fontFamily:T.sans, fontSize:11, fontWeight:600, color:canAssign?T.codex:T.faint, cursor:canAssign?'pointer':'default' }}>
          Assign ›</span>
      </div>
    </div>
  );
}

function FreeAgentChip({ a, dropHot, onDragOver, onDragLeave, onDrop }) {
  const p = PROVIDER[a.provider];
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{ display:'flex', alignItems:'center', gap:9, background: dropHot?p.color+'18':T.surface,
        border:`1.5px ${dropHot?'solid':'dashed'} ${dropHot?p.color:T.border}`, borderRadius:12, padding:'9px 11px',
        transition:'all .14s' }}>
      <Headshot agent={a} size={34} radius={8} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12.5, fontWeight:600 }}>{a.name} <span style={{ fontFamily:T.mono, fontSize:9, color:p.color }}>{p.label.toLowerCase()}</span></div>
        <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint }}>{dropHot?'drop to dispatch':'free · drag a task here'}</div>
      </div>
    </div>
  );
}

function WorkingCard({ a, onOpen }) {
  const p = PROVIDER[a.provider];
  return (
    <div onClick={onOpen} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'12px 13px 11px',
      display:'flex', flexDirection:'column', gap:10, position:'relative', overflow:'hidden', cursor:'pointer' }}>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        <Headshot agent={a} size={38} radius={9} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:T.sans, fontSize:13.5, fontWeight:600 }}>{a.name}</span>
            <span style={{ fontFamily:T.mono, fontSize:9, color:p.color, background:p.color+'1f', padding:'1px 4px', borderRadius:4 }}>{p.label.toLowerCase()}</span>
          </div>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.faint, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.branch}</div>
        </div>
        <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.green }}>{fmtSecs(a.secs)}</span>
      </div>

      <div style={{ fontFamily:T.sans, fontSize:12.5, color:T.text, lineHeight:1.3 }}>{a.task}</div>

      <div style={{ display:'flex', alignItems:'center', gap:7, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'6px 8px' }}>
        <span style={{ width:5, height:5, borderRadius:'50%', background:T.green, animation:'dotPulse 1.4s infinite', flex:'0 0 auto' }} />
        <span style={{ fontFamily:T.mono, fontSize:10, color:T.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.line}</span>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <Diff add={a.add} del={a.del} />
        <span style={{ fontFamily:T.mono, fontSize:10, color:T.faint }}>{a.files} files</span>
        <div style={{ flex:1 }} />
        <span style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint }}>{Math.round(a.prog*100)}%</span>
      </div>

      <div style={{ position:'absolute', left:0, right:0, bottom:0, height:2, background:T.surface }}>
        <div style={{ width:`${a.prog*100}%`, height:'100%', background:p.color, transition:'width .6s linear' }} />
      </div>
    </div>
  );
}

function ReviewCard({ a, accent, onOpen, onMerge, onRetry }) {
  const p = PROVIDER[a.provider];
  const err = a.status === 'error';
  return (
    <div onClick={onOpen} style={{ background:T.card, border:`1px solid ${err?T.danger+'44':T.border}`, borderRadius:12, padding:'12px 13px',
      display:'flex', flexDirection:'column', gap:9, cursor:'pointer' }}>
      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
        <Headshot agent={a} size={38} radius={9} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:T.sans, fontSize:13.5, fontWeight:600 }}>{a.name}</span>
            <StatusDot status={a.status} size={6} />
          </div>
          <div style={{ fontFamily:T.mono, fontSize:10, color:T.faint, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.task}</div>
        </div>
      </div>
      <div style={{ fontFamily:T.mono, fontSize:10.5, color: err?T.danger:T.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {err ? '✗ '+a.line : '✓ '+a.line}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }} onClick={e=>e.stopPropagation()}>
        <Diff add={a.add} del={a.del} />
        <div style={{ flex:1 }} />
        {err ? (
          <>
            <button style={bbtn(T.surface2)} onClick={onRetry}>Retry</button>
            <button style={bbtn(T.surface2)} onClick={onOpen}>Log</button>
          </>
        ) : (
          <>
            <button style={bbtn(T.surface2)} onClick={onOpen}>Diff</button>
            <button style={bbtn(accent,true)} onClick={onMerge}>Merge</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---- live session drawer ----------------------------------------------- */
function fileDiffs(a){
  const base = (a.branch ? a.branch.split('/').slice(-1)[0] : 'index').replace(/-/g,'_');
  const L = (t,k)=>({t,k});
  const main = `src/${base}.ts`, test = `src/${base}.test.ts`;
  return [
    { path: main, status:'M', add: Math.max(4, Math.round((a.add||20)*0.55)), del: Math.max(2, Math.round((a.del||6)*0.8)),
      hunks: [
        { h:'@@ -18,9 +18,14 @@ async function handler(req, res) {', lines:[
          L(' async function handler(req, res) {','ctx'),
          L('-  return next(req)','del'),
          L('+  const started = Date.now()','add'),
          L('+  if (!(await limiter.check(req.ip))) {','add'),
          L("+    return res.status(429).json({ error: 'rate_limited' })",'add'),
          L('+  }','add'),
          L('   return next(req)','ctx'),
          L(' }','ctx'),
        ]},
        { h:'@@ -41,6 +46,8 @@ const limiter = createLimiter({', lines:[
          L(' const limiter = createLimiter({','ctx'),
          L('-  window: 30,','del'),
          L('+  window: 60,        // seconds','add'),
          L('+  max: 100,          // per ip','add'),
          L(' })','ctx'),
        ]},
      ]},
    { path: test, status:'A', add: Math.max(3, Math.round((a.add||20)*0.3)), del: 0,
      hunks: [{ h:'@@ -0,0 +1,8 @@', lines:[
        L(`+import { handler } from './${base}'`,'add'),
        L('+','add'),
        L("+test('blocks requests over the limit', async () => {",'add'),
        L('+  for (let i = 0; i < 101; i++) await hit()','add'),
        L('+  expect(last.status).toBe(429)','add'),
        L('+})','add'),
      ]}]},
    { path:'README.md', status:'M', add:3, del:1,
      hunks: [{ h:'@@ -12,3 +12,5 @@ ## Configuration', lines:[
        L(' | Option | Default |','ctx'),
        L('-| window | 30s |','del'),
        L('+| window | 60s |','add'),
        L('+| max    | 100  |','add'),
      ]}]},
  ];
}
function fileStat(s){ return s==='A'?{c:T.green,t:'A'} : s==='D'?{c:T.danger,t:'D'} : {c:T.amber,t:'M'}; }

function DiffView({ a }){
  const files = React.useMemo(()=>fileDiffs(a), [a.id]);
  const [sel, setSel] = React.useState(files[0].path);
  React.useEffect(()=>{ setSel(files[0].path); }, [a.id]);
  const file = files.find(f=>f.path===sel) || files[0];
  const cmap = { add:T.green, del:T.danger, ctx:T.muted };
  return (
    <div>
      <div style={{ fontFamily:T.mono, fontSize:9, color:T.faint, letterSpacing:'.1em', marginBottom:8 }}>{files.length} FILES CHANGED</div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden', marginBottom:14 }}>
        {files.map((f,i) => { const st=fileStat(f.status); const on=f.path===sel;
          return (
            <button key={f.path} onClick={()=>setSel(f.path)} style={{ display:'flex', alignItems:'center', gap:8, width:'100%',
              background:on?T.tint+'14':'transparent', border:'none', borderTop:i?`1px solid ${T.border}`:'none', padding:'8px 11px', cursor:'pointer', textAlign:'left' }}>
              <span style={{ width:16, height:16, borderRadius:4, background:st.c+'22', color:st.c, fontSize:9, fontWeight:700, fontFamily:T.mono, display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto' }}>{st.t}</span>
              <span style={{ fontFamily:T.mono, fontSize:11, color:on?T.text:T.muted, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.path}</span>
              <span style={{ fontFamily:T.mono, fontSize:10 }}><span style={{ color:T.green }}>+{f.add}</span> <span style={{ color:T.danger }}>−{f.del}</span></span>
            </button>
          );
        })}
      </div>
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, overflow:'hidden' }}>
        <div style={{ fontFamily:T.mono, fontSize:10.5, color:T.text, fontWeight:600, padding:'8px 11px', borderBottom:`1px solid ${T.border}` }}>{file.path}</div>
        <pre style={{ margin:0, padding:'8px 0', fontFamily:T.mono, fontSize:10.5, lineHeight:1.65, overflowX:'auto' }}>
          {file.hunks.map((hk,hi) => (
            <div key={hi}>
              <div style={{ color:T.codex, background:T.tint+'0d', padding:'2px 11px' }}>{hk.h}</div>
              {hk.lines.map((l,li) => {
                const bg = l.k==='add' ? 'rgba(52,199,89,.12)' : l.k==='del' ? 'rgba(255,59,48,.10)' : 'transparent';
                return <div key={li} style={{ color:cmap[l.k], background:bg, padding:'0 11px', whiteSpace:'pre' }}>{l.t}</div>;
              })}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

function SessionDrawer({ a, accent, onClose, onMerge, onDiscard, onRetry }) {
  const p = PROVIDER[a.provider];
  const live = a.status === 'running';
  const [tab, setTab] = React.useState('output');
  const scroller = React.useRef(null);
  React.useEffect(() => { if(scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [a.out, tab]);

  return (
    <div style={{ position:'absolute', top:0, right:0, bottom:0, width:452, background:T.card, borderLeft:`1px solid ${T.border}`,
      display:'flex', flexDirection:'column', boxShadow:'-24px 0 48px rgba(0,0,0,.45)', zIndex:20 }}>
      {/* header */}
      <div style={{ padding:'14px 18px', borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Headshot agent={a} size={42} radius={10} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontFamily:T.sans, fontSize:16, fontWeight:600 }}>{a.name}</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10.5, fontWeight:600, color:STATUS[a.status].color, background:STATUS[a.status].color+'1a', border:`1px solid ${STATUS[a.status].color}2e`, padding:'2px 8px', borderRadius:999 }}>
                <StatusDot status={a.status} size={5} />{STATUS[a.status].label}</span>
            </div>
            <div style={{ fontFamily:T.mono, fontSize:10, color:T.faint, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.project} · {a.branch}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:T.muted, fontSize:18, cursor:'pointer', lineHeight:1, padding:4 }}>×</button>
        </div>
        <div style={{ marginTop:11, fontSize:13.5, fontWeight:500 }}>{a.task}</div>
        {/* tabs */}
        <div style={{ display:'flex', gap:2, marginTop:12, marginBottom:-14 }}>
          {['output','diff'].map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ fontFamily:T.sans, fontSize:11.5, fontWeight:600, textTransform:'capitalize',
              color: tab===t?T.text:T.muted, background:'transparent', border:'none', borderBottom:`2px solid ${tab===t?accent:'transparent'}`,
              padding:'6px 10px', cursor:'pointer' }}>{t}</button>
          ))}
        </div>
      </div>

      {/* body */}
      <div ref={scroller} style={{ flex:1, overflowY:'auto', background:T.surface, padding:'14px 18px' }}>
        {tab==='output' ? (
          <>
            {a.out.map((l,i) => {
              const c = l.startsWith('▸') ? T.codex : l.startsWith('  ✓') ? T.green : l.startsWith('  ✗') ? T.danger : l.startsWith('  ') ? T.muted : T.text;
              return <div key={i} style={{ fontFamily:T.mono, fontSize:11, lineHeight:1.6, color:c, whiteSpace:'pre-wrap' }}>{l}</div>;
            })}
            {live && <div style={{ display:'inline-block', width:7, height:13, background:T.green, animation:'blink 1s steps(1) infinite', marginTop:4 }} />}
            {a.status==='error' && <div style={{ fontFamily:T.mono, fontSize:11, color:T.danger, marginTop:6 }}>✗ {a.line}</div>}
          </>
        ) : (
          <DiffView a={a} />
        )}
      </div>

      {/* footer */}
      <div style={{ padding:'12px 18px', borderTop:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:8 }}>
        <Diff add={a.add} del={a.del} />
        <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.faint }}>{a.files} files · {fmtSecs(a.secs)}</span>
        <div style={{ flex:1 }} />
        {live && <button style={bbtn(T.surface2)} onClick={onDiscard}>Stop</button>}
        {a.status==='done' && <>
          <button style={bbtn(T.surface2)} onClick={onDiscard}>Discard</button>
          <button style={bbtn(accent,true)} onClick={onMerge}>Merge ✓</button>
        </>}
        {a.status==='error' && <>
          <button style={bbtn(T.surface2)} onClick={onDiscard}>Discard</button>
          <button style={bbtn(accent,true)} onClick={onRetry}>Retry</button>
        </>}
      </div>
    </div>
  );
}

/* ---- new task modal ---------------------------------------------------- */
function fieldLabel(t){ return <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>{t}</div>; }
const inputStyle = { width:'100%', boxSizing:'border-box', background:T.surface, border:`1px solid ${T.border}`, borderRadius:9,
  padding:'9px 11px', fontFamily:T.sans, fontSize:13, color:T.text, outline:'none' };

function NewTaskModal({ accent, onClose, onCreate }) {
  const [title, setTitle] = React.useState('');
  const [project, setProject] = React.useState(PROJECTS[0]);
  const [role, setRole] = React.useState('any');
  const [base, setBase] = React.useState('main');
  const valid = title.trim().length > 2;
  function submit(){ if(!valid) return; onCreate({ title: title.trim(), project, role, base }); }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:440, background:T.card, border:`1px solid ${T.border}`, borderRadius:16,
        padding:'20px 22px 18px', boxShadow:'0 30px 80px rgba(0,0,0,.6)' }}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontFamily:T.sans, fontSize:17, fontWeight:600 }}>New task</span>
          <div style={{ flex:1 }} />
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:T.muted, fontSize:18, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>

        <div style={{ marginBottom:14 }}>
          {fieldLabel('Title')}
          <input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="What should the agent do?"
            onKeyDown={e=>{ if(e.key==='Enter') submit(); }}
            style={{ ...inputStyle }} onFocus={e=>e.target.style.borderColor=accent} onBlur={e=>e.target.style.borderColor=T.border} />
        </div>

        <div style={{ display:'flex', gap:12, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            {fieldLabel('Project')}
            <select value={project} onChange={e=>setProject(e.target.value)} style={{ ...inputStyle, cursor:'pointer' }}>
              {PROJECTS.map(p => <option key={p} value={p} style={{ background:T.surface }}>{p}</option>)}
            </select>
          </div>
          <div style={{ width:130 }}>
            {fieldLabel('Base branch')}
            <input value={base} onChange={e=>setBase(e.target.value)} style={{ ...inputStyle, fontFamily:T.mono, fontSize:12 }} />
          </div>
        </div>

        <div style={{ marginBottom:20 }}>
          {fieldLabel('Run with')}
          <div style={{ display:'flex', gap:8 }}>
            {[['any','Any agent'],['claude','Claude'],['codex','Codex']].map(([v,l]) => {
              const on = role===v; const c = v==='claude'?T.claude : v==='codex'?T.codex : T.text;
              return <button key={v} onClick={()=>setRole(v)} style={{ flex:1, fontFamily:T.sans, fontSize:12.5, fontWeight:600,
                color: on?(v==='any'?'#FFFFFF':c):T.muted, background: on?(v==='any'?accent:c+'1f'):T.surface,
                border:`1px solid ${on?(v==='any'?accent:c+'55'):T.border}`, borderRadius:9, padding:'8px 0', cursor:'pointer', transition:'all .12s' }}>{l}</button>;
            })}
          </div>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:'0 0 auto', fontFamily:T.sans, fontSize:13, fontWeight:600, color:T.muted,
            background:'transparent', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 16px', cursor:'pointer' }}>Cancel</button>
          <button onClick={submit} disabled={!valid} style={{ flex:1, fontFamily:T.sans, fontSize:13, fontWeight:700,
            color:'#FFFFFF', background:accent, border:'none', borderRadius:10, padding:'10px 0', cursor:valid?'pointer':'default', opacity:valid?1:0.4 }}>Add to queue</button>
        </div>
      </div>
    </div>
  );
}

/* ---- the board --------------------------------------------------------- */
function initialAgents(){
  const seed = AGENTS.map(a => ({ ...a, secs: parseSecs(a.elapsed),
    out: a.status==='running' ? [`▸ checkout ${a.branch}`, `▸ read ${a.project}/src/`, a.line]
       : a.status==='done'    ? [`▸ checkout ${a.branch}`, '  applying patch · '+a.files+' files', '  ✓ '+a.line]
       : a.status==='error'   ? [`▸ checkout ${a.branch}`, '  applying patch…', '  ✗ '+a.line]
       : [] }));
  // an extra free codex agent so dispatch works for both roles
  seed.push({ id:'s7', name:'Gil', provider:'codex', tint:AGENT_TINT.Gil, status:'idle', project:null, branch:null,
    task:'Awaiting assignment', line:'Idle', add:0, del:0, prog:0, files:0, secs:0, out:[] });
  return seed;
}

function BoardView({ width = 1180, accent, tab = 'Office', onNav }) {
  accent = accent || T.green;
  const saved = React.useRef(loadSaved()).current;
  const [agents, setAgents] = React.useState(() => (saved && saved.agents) || initialAgents());
  const [tasks, setTasks]   = React.useState(() => (saved && saved.tasks) || QUEUE.map(q => ({ ...q })));
  const [merged, setMerged] = React.useState(() => (saved && saved.merged) || 0);
  const [sel, setSel]       = React.useState(null);     // open drawer agent id
  const [drag, setDrag]     = React.useState(null);     // dragged task id
  const [hot, setHot]       = React.useState(null);     // hovered drop agent id
  const [overTask, setOverTask] = React.useState(null); // queue card being hovered for reorder
  const [showNew, setShowNew] = React.useState(false);
  const tick = React.useRef(0);

  // persist (keep the floor where you left it across refreshes)
  React.useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ agents, tasks, merged })); } catch(e) {}
  }, [agents, tasks, merged]);

  // live stream
  React.useEffect(() => {
    const id = setInterval(() => {
      tick.current++;
      setAgents(prev => prev.map(a => {
        if (a.status !== 'running') return a;
        const n = (a.out.length);
        const prog = Math.min(1, a.prog + 0.045 + Math.random()*0.02);
        const line = streamLine(a, tick.current + (a.seat||0));
        const out = [...a.out, line].slice(-60);
        const add = a.add + Math.floor(Math.random()*9);
        const base = { ...a, prog, secs: a.secs + 2, add, line, out, files: a.files + (Math.random()<0.15?1:0) };
        if (prog >= 1) return { ...base, status:'done', line:'finished — ready to merge', out:[...out, '  ✓ done — ready to merge'] };
        return base;
      }));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  const free   = agents.filter(a => a.status==='idle');
  const working= agents.filter(a => a.status==='running');
  const review = agents.filter(a => a.status==='done' || a.status==='error');
  const selAgent = agents.find(a => a.id===sel);

  function dispatch(task, agentId){
    setTasks(ts => ts.filter(t => t.id!==task.id));
    setAgents(as => as.map(a => a.id!==agentId ? a : ({
      ...a, status:'running', project:task.project, branch:`${task.role==='codex'?'feat':'feat'}/${slug(task.title)}`,
      task:task.title, line:'starting session…', prog:0.04, secs:0, add:0, del:0, files:1,
      out:['▸ booting agent', `▸ checkout main`, '▸ create worktree'],
    })));
  }
  function assignFirst(task){
    const a = free.find(x => eligible(task.role, x.provider));
    if (a) dispatch(task, a.id);
  }
  function reorder(draggedId, targetId){
    setTasks(ts => { const arr=[...ts]; const fi=arr.findIndex(t=>t.id===draggedId); if(fi<0) return ts;
      const [m]=arr.splice(fi,1); const ti=arr.findIndex(t=>t.id===targetId); arr.splice(ti<0?arr.length:ti,0,m); return arr; });
  }
  function runQueue(){
    const pool = [...free]; const plan = [];
    for (const t of tasks){ const i = pool.findIndex(a => eligible(t.role, a.provider)); if(i>=0){ plan.push([t, pool[i].id]); pool.splice(i,1); } }
    plan.forEach(([t,aid],i) => setTimeout(() => dispatch(t, aid), i*480));
  }
  function merge(id){ setMerged(m=>m+1); setSel(s=>s===id?null:s); free_up(id); }
  function discard(id){ setSel(s=>s===id?null:s); free_up(id); }
  function free_up(id){ setAgents(as => as.map(a => a.id!==id ? a : ({
    ...a, status:'idle', project:null, branch:null, task:'Awaiting assignment', line:'Idle', prog:0, add:0, del:0, files:0, secs:0, out:[] })));
  }
  function retry(id){ setAgents(as => as.map(a => a.id!==id ? a : ({ ...a, status:'running', line:'retrying…', prog:0.2, out:[...a.out,'▸ retry from checkpoint'] }))); }
  function createTask(t){ setTasks(ts => [...ts, { id:'q'+Date.now(), ...t }]); setShowNew(false); }
  function resetFloor(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} setAgents(initialAgents()); setTasks(QUEUE.map(q=>({...q}))); setMerged(0); setSel(null); }

  const col = { flex:'1 1 0', display:'flex', flexDirection:'column', gap:10, minWidth:0, overflowY:'auto', paddingBottom:8 };
  const stats = [['On the floor', agents.length, T.text], ['Working', working.length, T.green], ['In review', review.length, T.amber], ['Free', free.length, T.muted], ['Merged today', merged, accent]];

  return (
    <Shell tab={tab} onNav={onNav} actions={<>
      <button onClick={resetFloor} title="Reset the demo floor"
        style={{ fontFamily:T.sans, fontSize:13, color:T.muted, background:'transparent', border:`1px solid ${T.border}`, borderRadius:9, width:32, height:32, cursor:'pointer' }}>↺</button>
      <button onClick={runQueue} disabled={!tasks.length || !free.length}
        style={{ fontFamily:T.sans, fontSize:12, fontWeight:600, color: (!tasks.length||!free.length)?T.faint:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:9, padding:'7px 12px', cursor:(!tasks.length||!free.length)?'default':'pointer', whiteSpace:'nowrap' }}>▶ Run queue</button>
      <button onClick={()=>setShowNew(true)} style={{ fontFamily:T.sans, fontSize:12.5, fontWeight:600, color:'#FFFFFF', background:accent, border:'none', borderRadius:9, padding:'8px 14px', cursor:'pointer', whiteSpace:'nowrap' }}>+ New task</button>
    </>}>

      {/* stat strip */}
      <div style={{ display:'flex', gap:28, padding:'14px 22px 8px', flex:'0 0 auto' }}>
        {stats.map(([l,v,c]) => (
          <div key={l} style={{ display:'flex', flexDirection:'column' }}>
            <span style={{ fontFamily:T.sans, fontSize:22, fontWeight:600, color:c, letterSpacing:'-.02em' }}>{v}</span>
            <span style={{ fontFamily:T.mono, fontSize:10, color:T.faint, textTransform:'uppercase', letterSpacing:'.08em', whiteSpace:'nowrap' }}>{l}</span>
          </div>
        ))}
      </div>

      {/* columns */}
      <div style={{ display:'flex', gap:16, padding:'8px 22px 16px', flex:1, minHeight:0, alignItems:'stretch' }}>
        {/* QUEUE */}
        <div style={col}>
          <BColHead title="Queue" count={tasks.length} color={T.muted} />
          {tasks.map(q => (
            <QueueCard key={q.id} q={q} freeAgents={free} dragging={drag===q.id}
              over={overTask===q.id && drag && drag!==q.id}
              onDragStart={()=>setDrag(q.id)} onDragEnd={()=>{setDrag(null);setHot(null);setOverTask(null);}}
              onOver={e=>{ if(drag){ e.preventDefault(); setOverTask(q.id); } }}
              onLeave={()=>setOverTask(o=>o===q.id?null:o)}
              onDrop={e=>{ if(drag && drag!==q.id){ e.preventDefault(); reorder(drag,q.id); } setOverTask(null); }}
              onAssign={()=>assignFirst(q)} />
          ))}
          {!tasks.length && <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, padding:'8px 4px' }}>queue empty ✦</div>}
          <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint, textTransform:'uppercase', letterSpacing:'.08em', padding:'8px 4px 2px' }}>Free agents</div>
          {free.map(a => (
            <FreeAgentChip key={a.id} a={a} dropHot={hot===a.id && drag!=null}
              onDragOver={e=>{ e.preventDefault(); setHot(a.id); }}
              onDragLeave={()=>setHot(h=>h===a.id?null:h)}
              onDrop={()=>{ const t=tasks.find(x=>x.id===drag); if(t && eligible(t.role,a.provider)) dispatch(t,a.id); setDrag(null); setHot(null); }} />
          ))}
          {!free.length && <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, padding:'2px 4px' }}>all agents busy</div>}
        </div>

        {/* WORKING */}
        <div style={col}>
          <BColHead title="Working" count={working.length} color={T.green} />
          {working.map(a => <WorkingCard key={a.id} a={a} onOpen={()=>setSel(a.id)} />)}
          {!working.length && <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, padding:'8px 4px' }}>nobody’s coding — dispatch a task →</div>}
        </div>

        {/* REVIEW */}
        <div style={col}>
          <BColHead title="Review" count={review.length} color={T.amber} />
          {review.map(a => <ReviewCard key={a.id} a={a} accent={accent} onOpen={()=>setSel(a.id)} onMerge={()=>merge(a.id)} onRetry={()=>retry(a.id)} />)}
          {!review.length && <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, padding:'8px 4px' }}>nothing to review</div>}
        </div>
      </div>

      {selAgent && (
        <SessionDrawer a={selAgent} accent={accent} onClose={()=>setSel(null)}
          onMerge={()=>merge(selAgent.id)} onDiscard={()=>discard(selAgent.id)} onRetry={()=>retry(selAgent.id)} />
      )}
      {showNew && <NewTaskModal accent={accent} onClose={()=>setShowNew(false)} onCreate={createTask} />}
    </Shell>
  );
}

window.BoardView = BoardView;
Object.assign(window, { initialAgents, streamLine, fileDiffs, fmtSecs, parseSecs, eligible, slug, DiffView });
