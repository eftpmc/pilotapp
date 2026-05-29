/* tabs.jsx — Agents · Projects · Settings screens for the Pilot shell.
   window.AgentsView, window.ProjectsView, window.SettingsView */

const { T, PROVIDER, STATUS, AGENTS, AGENT_TINT, Headshot, Shell, StatusDot } = window;

/* ====== shared little controls ========================================== */
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ width:46, height:28, borderRadius:999, border:'none', cursor:'pointer', padding:2,
      background:on?T.green:'#E3E3E8', transition:'background .18s', display:'flex', justifyContent:on?'flex-end':'flex-start' }}>
      <span style={{ width:24, height:24, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,.25)', transition:'all .18s' }} />
    </button>
  );
}
function Segmented({ value, onChange, items, accent }) {
  return (
    <div style={{ display:'flex', gap:2, background:T.surface2, borderRadius:8, padding:2 }}>
      {items.map(([v,l]) => { const on=v===value;
        return <button key={v} onClick={()=>onChange(v)} style={{ fontFamily:T.sans, fontSize:12, fontWeight:on?600:500,
          color:on?T.text:T.muted, background:on?'#fff':'transparent', border:'none', borderRadius:6, padding:'5px 11px', cursor:'pointer',
          boxShadow:on?'0 1px 2px rgba(0,0,0,.12)':'none' }}>{l}</button>; })}
    </div>
  );
}
function Group({ title, children }) {
  return (
    <div style={{ marginBottom:26 }}>
      {title && <div style={{ fontFamily:T.sans, fontSize:11.5, fontWeight:600, color:T.muted, textTransform:'uppercase', letterSpacing:'.04em', margin:'0 4px 8px' }}>{title}</div>}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:13, overflow:'hidden' }}>{children}</div>
    </div>
  );
}
function Row({ label, sub, right, first }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 15px', borderTop:first?'none':`1px solid ${T.border}`, minHeight:30 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:T.sans, fontSize:14, color:T.text }}>{label}</div>
        {sub && <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, marginTop:2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}
const scrollArea = { flex:1, overflowY:'auto', padding:'24px 26px 40px' };
const maxer = { maxWidth:920, margin:'0 auto' };
function H1({ children, sub }) {
  return (
    <div style={{ marginBottom:20 }}>
      <h1 style={{ margin:0, fontFamily:T.sans, fontSize:26, fontWeight:600, letterSpacing:'-.02em' }}>{children}</h1>
      {sub && <div style={{ fontFamily:T.sans, fontSize:14, color:T.muted, marginTop:3 }}>{sub}</div>}
    </div>
  );
}
function primaryBtn(label, onClick) {
  return <button onClick={onClick} style={{ fontFamily:T.sans, fontSize:12.5, fontWeight:600, color:'#fff', background:T.tint, border:'none', borderRadius:9, padding:'8px 14px', cursor:'pointer', whiteSpace:'nowrap' }}>{label}</button>;
}

const NEWTINTS = ['#FF375F','#AC8E68','#5E5CE6','#FF9F0A','#30B0C7','#BF5AF2','#64D2FF'];
const inputStyle = { width:'100%', boxSizing:'border-box', background:T.surface, border:`1px solid ${T.border}`, borderRadius:9, padding:'9px 11px', fontFamily:T.sans, fontSize:13, color:T.text, outline:'none' };
function Field({ label, children }) {
  return <div style={{ marginBottom:14 }}>
    <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint, textTransform:'uppercase', letterSpacing:'.1em', marginBottom:6 }}>{label}</div>
    {children}
  </div>;
}
function Modal({ title, onClose, children, footer }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:70 }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:440, maxWidth:'92vw', background:T.card, border:`1px solid ${T.border}`, borderRadius:16, padding:'20px 22px 18px', boxShadow:'0 30px 80px rgba(0,0,0,.5)' }}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontFamily:T.sans, fontSize:17, fontWeight:600 }}>{title}</span>
          <div style={{ flex:1 }} />
          <button onClick={onClose} style={{ background:'none', border:'none', color:T.muted, fontSize:18, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        {children}
        <div style={{ display:'flex', gap:10, marginTop:18 }}>{footer}</div>
      </div>
    </div>
  );
}
function modalBtns(onClose, onOk, okLabel, valid) {
  return <>
    <button onClick={onClose} style={{ flex:'0 0 auto', fontFamily:T.sans, fontSize:13, fontWeight:600, color:T.muted, background:'transparent', border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 16px', cursor:'pointer' }}>Cancel</button>
    <button onClick={valid?onOk:undefined} disabled={!valid} style={{ flex:1, fontFamily:T.sans, fontSize:13, fontWeight:700, color:'#fff', background:T.tint, border:'none', borderRadius:10, padding:'10px 0', cursor:valid?'pointer':'default', opacity:valid?1:0.4 }}>{okLabel}</button>
  </>;
}

/* ====== AGENTS ========================================================== */
const AGENT_STATS = { Atlas:[34,'2.1k'], Bishop:[28,'1.4k'], Cleo:[12,'480'], Dex:[41,'3.0k'], Echo:[19,'890'], Fern:[23,'1.7k'], Gil:[7,'210'] };
function AgentCard({ a }) {
  const p = PROVIDER[a.provider];
  const st = STATUS[a.status];
  const [runs, lines] = AGENT_STATS[a.name] || [0,'0'];
  return (
    <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:15, padding:16, display:'flex', flexDirection:'column', gap:13 }}>
      <div style={{ display:'flex', alignItems:'center', gap:13 }}>
        <Headshot agent={a} size={52} radius={13} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontFamily:T.sans, fontSize:17, fontWeight:600 }}>{a.name}</span>
            <span style={{ fontFamily:T.mono, fontSize:9.5, color:p.color, background:p.color+'1a', border:`1px solid ${p.color}33`, padding:'1px 6px', borderRadius:5 }}>{p.label.toLowerCase()}</span>
          </div>
          <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, marginTop:3 }}>{p.model}</div>
        </div>
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:st.color, background:st.color+'1a', border:`1px solid ${st.color}2e`, padding:'3px 9px', borderRadius:999 }}>
          <StatusDot status={a.status} size={5} />{st.label}</span>
      </div>
      <div style={{ fontFamily:T.sans, fontSize:13, color:T.muted, paddingBottom:1 }}>
        {a.status==='running' ? <>On <span style={{color:T.text}}>{a.task}</span></>
          : a.status==='error' ? <span style={{color:T.danger}}>Needs attention · {a.task}</span>
          : a.status==='done' ? <>Finished <span style={{color:T.text}}>{a.task}</span></>
          : 'Idle — ready for a task'}
      </div>
      <div style={{ display:'flex', gap:22, borderTop:`1px solid ${T.border}`, paddingTop:12 }}>
        {[['Sessions', runs],['Lines merged', lines],['Identity', null]].map(([l,v]) => (
          <div key={l} style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {v!==null
              ? <span style={{ fontFamily:T.sans, fontSize:16, fontWeight:600 }}>{v}</span>
              : <span style={{ width:18, height:18, borderRadius:5, background:a.tint, marginTop:-1 }} />}
            <span style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint, textTransform:'uppercase', letterSpacing:'.06em' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
const GIL = { id:'s7', name:'Gil', provider:'codex', status:'idle', task:'Awaiting assignment', tint:AGENT_TINT.Gil };
function HireModal({ onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [prov, setProv] = React.useState('claude');
  const valid = name.trim().length > 1;
  return (
    <Modal title="Hire an agent" onClose={onClose} footer={modalBtns(onClose, ()=>onCreate({ name:name.trim(), provider:prov }), 'Hire agent', valid)}>
      <Field label="Name"><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Nova" style={inputStyle}
        onKeyDown={e=>{ if(e.key==='Enter' && valid) onCreate({ name:name.trim(), provider:prov }); }} /></Field>
      <Field label="Model"><Segmented value={prov} onChange={setProv} items={[['claude','Claude'],['codex','Codex']]} /></Field>
      <div style={{ display:'flex', alignItems:'center', gap:10, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, padding:'10px 12px' }}>
        <span style={{ width:30, height:30, borderRadius:8, background:(prov==='claude'?PROVIDER.claude.color:PROVIDER.codex.color)+'1f', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ width:12, height:12, borderRadius:3, background:prov==='claude'?PROVIDER.claude.color:PROVIDER.codex.color }} /></span>
        <span style={{ fontFamily:T.mono, fontSize:11, color:T.muted }}>{prov==='claude'?'claude code · oauth':'codex cli · api key'}</span>
      </div>
    </Modal>
  );
}
function AgentsView({ tab, onNav }) {
  const [extra, setExtra] = React.useState([]);
  const [hire, setHire] = React.useState(false);
  const all = [...AGENTS, GIL, ...extra];
  const claude = all.filter(a=>a.provider==='claude');
  const codex = all.filter(a=>a.provider==='codex');
  function create(d){ setExtra(x=>[...x, { id:'h'+Date.now(), status:'idle', task:'Awaiting assignment', tint:NEWTINTS[(AGENTS.length+x.length)%NEWTINTS.length], face:d.provider, ...d }]); setHire(false); }
  const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14 };
  return (
    <Shell tab={tab} onNav={onNav} actions={primaryBtn('+ Hire agent', ()=>setHire(true))}>
      <div style={scrollArea}><div style={maxer}>
        <H1 sub={`${all.length} agents across Claude and Codex`}>Agents</H1>
        <div style={{ fontFamily:T.sans, fontSize:12.5, fontWeight:600, color:PROVIDER.claude.color, margin:'4px 4px 10px' }}>CLAUDE · {claude.length}</div>
        <div style={{ ...grid, marginBottom:24 }}>{claude.map(a=><AgentCard key={a.id} a={a} />)}</div>
        <div style={{ fontFamily:T.sans, fontSize:12.5, fontWeight:600, color:PROVIDER.codex.color, margin:'4px 4px 10px' }}>CODEX · {codex.length}</div>
        <div style={grid}>{codex.map(a=><AgentCard key={a.id} a={a} />)}</div>
      </div></div>
      {hire && <HireModal onClose={()=>setHire(false)} onCreate={create} />}
    </Shell>
  );
}

/* ====== PROJECTS ======================================================== */
const PROJECTS0 = [
  { id:'p1', name:'web-app',     path:'~/code/acme/web-app',     role:'any',    open:3, merged:128, lang:'TypeScript' },
  { id:'p2', name:'api-gateway', path:'~/code/acme/api-gateway', role:'codex',  open:1, merged:64,  lang:'Go' },
  { id:'p3', name:'core-db',     path:'~/code/acme/core-db',     role:'claude', open:2, merged:39,  lang:'Rust' },
  { id:'p4', name:'docs-site',   path:'~/code/acme/docs-site',   role:'any',    open:0, merged:51,  lang:'MDX' },
];
function ProjectRow({ p, onRole, first }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'15px 16px', borderTop:first?'none':`1px solid ${T.border}` }}>
      <div style={{ width:38, height:38, borderRadius:10, background:T.surface, border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto' }}>
        <span style={{ fontFamily:T.mono, fontSize:15, color:T.muted }}>{'{}'}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
          <span style={{ fontFamily:T.sans, fontSize:15, fontWeight:600 }}>{p.name}</span>
          <span style={{ fontFamily:T.mono, fontSize:10, color:T.faint }}>{p.lang}</span>
        </div>
        <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.path}</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, marginRight:6 }}>
        <span style={{ fontFamily:T.mono, fontSize:11, color:T.muted }}><span style={{color:p.open?T.amber:T.faint}}>{p.open} open</span> · {p.merged} merged</span>
      </div>
      <Segmented value={p.role} onChange={(v)=>onRole(p.id,v)} items={[['any','Any'],['claude','Claude'],['codex','Codex']]} />
    </div>
  );
}
function AddProjectModal({ onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [path, setPath] = React.useState('~/code/');
  const [role, setRole] = React.useState('any');
  const valid = name.trim().length > 1;
  function ok(){ onCreate({ name:name.trim().replace(/\s+/g,'-').toLowerCase(), path:path.trim()||('~/code/'+name.trim()), role }); }
  return (
    <Modal title="Add a project" onClose={onClose} footer={modalBtns(onClose, ok, 'Add project', valid)}>
      <Field label="Name"><input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. billing-svc" style={inputStyle}
        onKeyDown={e=>{ if(e.key==='Enter' && valid) ok(); }} /></Field>
      <Field label="Local path"><input value={path} onChange={e=>setPath(e.target.value)} style={{ ...inputStyle, fontFamily:T.mono, fontSize:12 }} /></Field>
      <Field label="Role rule"><Segmented value={role} onChange={setRole} items={[['any','Any'],['claude','Claude'],['codex','Codex']]} /></Field>
    </Modal>
  );
}
function ProjectsView({ tab, onNav }) {
  const [projects, setProjects] = React.useState(PROJECTS0);
  const [add, setAdd] = React.useState(false);
  function setRole(id, role){ setProjects(ps=>ps.map(p=>p.id===id?{...p,role}:p)); }
  function create(d){ setProjects(ps=>[...ps, { id:'p'+Date.now(), open:0, merged:0, lang:'—', ...d }]); setAdd(false); }
  return (
    <Shell tab={tab} onNav={onNav} actions={primaryBtn('+ Add project', ()=>setAdd(true))}>
      <div style={scrollArea}><div style={maxer}>
        <H1 sub="Repositories Pilot can work in. The role rule decides which agents may pick up a task.">Projects</H1>
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:14, overflow:'hidden' }}>
          {projects.map((p,i)=><ProjectRow key={p.id} p={p} first={i===0} onRole={setRole} />)}
        </div>
        <div style={{ fontFamily:T.sans, fontSize:12.5, color:T.muted, margin:'12px 4px 0' }}>
          <b style={{color:T.text, fontWeight:600}}>Role rule:</b> “Any” lets either model take the task; “Claude” / “Codex” pin it to one.
        </div>
      </div></div>
      {add && <AddProjectModal onClose={()=>setAdd(false)} onCreate={create} />}
    </Shell>
  );
}

/* ====== SETTINGS ======================================================== */
function CredRow({ name, model, ok, first }) {
  const p = PROVIDER[name];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 15px', borderTop:first?'none':`1px solid ${T.border}` }}>
      <span style={{ width:30, height:30, borderRadius:8, background:p.color+'1f', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto' }}>
        <span style={{ width:12, height:12, borderRadius:3, background:p.color }} />
      </span>
      <div style={{ flex:1 }}>
        <div style={{ fontFamily:T.sans, fontSize:14, color:T.text }}>{p.label}</div>
        <div style={{ fontFamily:T.mono, fontSize:11, color:T.faint }}>{model}</div>
      </div>
      {ok
        ? <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontFamily:T.sans, fontSize:12.5, fontWeight:600, color:T.green }}>✓ Connected</span>
        : <button style={{ fontFamily:T.sans, fontSize:12.5, fontWeight:600, color:'#fff', background:T.tint, border:'none', borderRadius:8, padding:'6px 12px', cursor:'pointer' }}>Connect</button>}
    </div>
  );
}
function SettingsView({ tab, onNav, accent, setAccent }) {
  const [autoMerge, setAutoMerge] = React.useState(false);
  const [notify, setNotify] = React.useState(true);
  const [max, setMax] = React.useState(4);
  const [branch, setBranch] = React.useState('main');
  const [theme, setTheme] = React.useState('light');
  const swatches = [['#0A84FF','Blue'],['#34C759','Green'],['#BF5AF2','Violet'],['#FF9500','Orange']];
  return (
    <Shell tab={tab} onNav={onNav}>
      <div style={scrollArea}><div style={{ maxWidth:620, margin:'0 auto' }}>
        <H1 sub="Credentials, defaults and appearance for this workspace.">Settings</H1>

        <Group title="Agent credentials">
          <CredRow name="claude" model="claude code · oauth" ok first />
          <CredRow name="codex"  model="codex cli · api key" ok />
        </Group>

        <Group title="Defaults">
          <Row first label="Default base branch" right={
            <input value={branch} onChange={e=>setBranch(e.target.value)} style={{ width:120, textAlign:'right', fontFamily:T.mono, fontSize:13, color:T.text, background:'transparent', border:'none', outline:'none' }} />} />
          <Row label="Auto-merge clean diffs" sub="merge with no conflicts automatically" right={<Toggle on={autoMerge} onClick={()=>setAutoMerge(v=>!v)} />} />
          <Row label="Notify when an agent needs me" right={<Toggle on={notify} onClick={()=>setNotify(v=>!v)} />} />
          <Row label="Max concurrent agents" right={
            <div style={{ display:'flex', alignItems:'center', gap:0, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
              <button onClick={()=>setMax(m=>Math.max(1,m-1))} style={stepBtn}>−</button>
              <span style={{ width:34, textAlign:'center', fontFamily:T.mono, fontSize:13 }}>{max}</span>
              <button onClick={()=>setMax(m=>Math.min(8,m+1))} style={stepBtn}>+</button>
            </div>} />
        </Group>

        <Group title="Appearance">
          <Row first label="Accent color" right={
            <div style={{ display:'flex', gap:8 }}>
              {swatches.map(([hex,nm]) => (
                <button key={hex} title={nm} onClick={()=>setAccent&&setAccent(hex)} style={{ width:24, height:24, borderRadius:'50%', background:hex, border:accent===hex?`2px solid ${T.text}`:'2px solid transparent', cursor:'pointer', boxShadow:'0 0 0 1px rgba(0,0,0,.08)' }} />
              ))}
            </div>} />
          <Row label="Theme" right={<Segmented value={theme} onChange={setTheme} items={[['light','Light'],['dark','Dark']]} />} />
        </Group>

        <Group title="Account">
          <Row first label="Signed in" sub="alex@acme.dev" right={<span style={{ fontFamily:T.sans, fontSize:13, color:T.muted }}>Team</span>} />
          <Row label={<span style={{ color:T.danger }}>Sign out</span>} />
        </Group>
      </div></div>
    </Shell>
  );
}
const stepBtn = { width:30, height:30, border:'none', background:'transparent', color:T.tint, fontSize:16, cursor:'pointer' };

Object.assign(window, { AgentsView, ProjectsView, SettingsView });
