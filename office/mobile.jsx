/* mobile.jsx — Pilot Control Room, phone form factor.
   Reuses shared data + board logic (initialAgents/streamLine/fileDiffs/DiffView).
   window.MobileApp */

const { T, PROVIDER, STATUS, AGENTS, QUEUE, Headshot, StatusDot, Diff,
        initialAgents, streamLine, fmtSecs, eligible, DiffView } = window;

function PhoneFrame({ children }) {
  return (
    <div style={{ width:390, height:'844px', maxHeight:'94vh', aspectRatio:'390 / 844', borderRadius:52, background:'#000', padding:12,
      boxShadow:'0 0 0 2px #d9d9de, 0 40px 90px rgba(0,0,0,.28)', position:'relative' }}>
      <div style={{ width:'100%', height:'100%', borderRadius:40, overflow:'hidden', background:T.bg, position:'relative' }}>
        <div style={{ position:'absolute', top:11, left:'50%', transform:'translateX(-50%)', width:120, height:30, background:'#000', borderRadius:16, zIndex:50 }} />
        {children}
      </div>
    </div>
  );
}

function MStatusBar() {
  return (
    <div style={{ height:46, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 26px',
      fontFamily:T.sans, fontSize:14, fontWeight:600, color:T.text, position:'relative', zIndex:40 }}>
      <span>9:41</span><span style={{ fontSize:11, color:T.muted }}>● ● ●</span>
    </div>
  );
}

function MTabBar({ active = 'Office' }) {
  const tabs = ['Office','Work','Agents','Projects'];
  return (
    <div style={{ position:'absolute', left:0, right:0, bottom:0, height:74, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)',
      borderTop:`1px solid ${T.border}`, display:'flex', alignItems:'flex-start', justifyContent:'space-around', paddingTop:10, zIndex:30 }}>
      {tabs.map(t => (
        <div key={t} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <span style={{ width:20, height:20, borderRadius:6, background:t===active?T.tint:T.faint }} />
          <span style={{ fontFamily:T.sans, fontSize:10, fontWeight:600, color:t===active?T.tint:T.faint }}>{t}</span>
        </div>
      ))}
      <div style={{ position:'absolute', bottom:8, left:'50%', transform:'translateX(-50%)', width:134, height:5, borderRadius:3, background:'#000' }} />
    </div>
  );
}

function Seg({ value, onChange, items }) {
  return (
    <div style={{ display:'flex', gap:2, background:T.surface2, borderRadius:9, padding:2, margin:'0 16px 12px' }}>
      {items.map(([v,l,n]) => {
        const on = v===value;
        return (
          <button key={v} onClick={()=>onChange(v)} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:5,
            fontFamily:T.sans, fontSize:13, fontWeight:on?600:500, color:on?T.text:T.muted, background:on?'#fff':'transparent',
            border:'none', borderRadius:7, padding:'7px 0', cursor:'pointer', boxShadow:on?'0 1px 3px rgba(0,0,0,.12)':'none' }}>
            {l}<span style={{ fontFamily:T.mono, fontSize:10, color:on?T.muted:T.faint }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/* mobile cards */
function MWorking({ a, onOpen }) {
  const p = PROVIDER[a.provider];
  return (
    <div onClick={onOpen} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:15, padding:13, marginBottom:10, position:'relative', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
        <Headshot agent={a} size={42} radius={10} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontFamily:T.sans, fontSize:15, fontWeight:600 }}>{a.name}</span>
            <span style={{ fontFamily:T.mono, fontSize:9, color:p.color, background:p.color+'1f', padding:'1px 5px', borderRadius:4 }}>{p.label.toLowerCase()}</span>
            <div style={{ flex:1 }} />
            <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.green }}>{fmtSecs(a.secs)}</span>
          </div>
          <div style={{ fontFamily:T.sans, fontSize:12.5, color:T.text, marginTop:3 }}>{a.task}</div>
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:7, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'7px 9px', marginTop:10 }}>
        <span style={{ width:5, height:5, borderRadius:'50%', background:T.green, animation:'dotPulse 1.4s infinite', flex:'0 0 auto' }} />
        <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.line}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:9 }}>
        <Diff add={a.add} del={a.del} />
        <span style={{ fontFamily:T.mono, fontSize:10, color:T.faint }}>{a.files} files</span>
        <div style={{ flex:1 }} />
        <span style={{ fontFamily:T.mono, fontSize:10, color:T.faint }}>{Math.round(a.prog*100)}%</span>
      </div>
      <div style={{ position:'absolute', left:0, right:0, bottom:0, height:3, background:T.surface }}>
        <div style={{ width:`${a.prog*100}%`, height:'100%', background:p.color, transition:'width .6s linear' }} />
      </div>
    </div>
  );
}

function MQueue({ q, freeAgents, onAssign }) {
  const can = freeAgents.some(a => eligible(q.role, a.provider));
  const rc = { any:T.muted, claude:T.claude, codex:T.codex }[q.role];
  return (
    <div style={{ background:T.card, border:`1px dashed ${T.border}`, borderRadius:15, padding:13, marginBottom:10 }}>
      <div style={{ fontFamily:T.sans, fontSize:14, fontWeight:500 }}>{q.title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:9 }}>
        <span style={{ fontFamily:T.mono, fontSize:10.5, color:T.faint }}>{q.project}</span>
        <span style={{ fontFamily:T.mono, fontSize:9.5, color:rc, background:rc+'1a', border:`1px solid ${rc}33`, padding:'1px 6px', borderRadius:5 }}>{q.role}</span>
        <div style={{ flex:1 }} />
        <button onClick={can?onAssign:undefined} style={{ fontFamily:T.sans, fontSize:12, fontWeight:600, color:'#fff',
          background:can?T.tint:T.surface2, border:'none', borderRadius:8, padding:'6px 14px', cursor:can?'pointer':'default', opacity:can?1:0.5 }}>Assign</button>
      </div>
    </div>
  );
}

function MReview({ a, onOpen, onMerge, onRetry }) {
  const err = a.status==='error';
  return (
    <div onClick={onOpen} style={{ background:T.card, border:`1px solid ${err?T.danger+'44':T.border}`, borderRadius:15, padding:13, marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
        <Headshot agent={a} size={42} radius={10} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span style={{ fontFamily:T.sans, fontSize:15, fontWeight:600 }}>{a.name}</span>
            <StatusDot status={a.status} size={7} />
          </div>
          <div style={{ fontFamily:T.sans, fontSize:12.5, color:T.muted, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.task}</div>
        </div>
      </div>
      <div style={{ fontFamily:T.mono, fontSize:10.5, color:err?T.danger:T.muted, marginTop:9, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {err ? '✗ '+a.line : '✓ '+a.line}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10 }} onClick={e=>e.stopPropagation()}>
        <Diff add={a.add} del={a.del} />
        <div style={{ flex:1 }} />
        {err
          ? <button onClick={onRetry} style={mbtn(T.surface2,T.text)}>Retry</button>
          : <><button onClick={onOpen} style={mbtn(T.surface2,T.text)}>Diff</button>
              <button onClick={onMerge} style={mbtn(T.tint,'#fff')}>Merge</button></>}
      </div>
    </div>
  );
}
function mbtn(bg,fg){ return { fontFamily:T.sans, fontSize:12, fontWeight:600, color:fg, background:bg, border:'none', borderRadius:9, padding:'7px 15px', cursor:'pointer' }; }

/* full-screen session sheet */
function MSession({ a, onClose, onMerge, onDiscard, onRetry }) {
  const p = PROVIDER[a.provider];
  const live = a.status==='running';
  const [tab,setTab]=React.useState('output');
  const sc=React.useRef(null);
  React.useEffect(()=>{ if(sc.current&&tab==='output') sc.current.scrollTop=sc.current.scrollHeight; },[a.out,tab]);
  return (
    <div style={{ position:'absolute', inset:0, background:T.bg, zIndex:45, display:'flex', flexDirection:'column' }}>
      <div style={{ height:46 }} />
      <div style={{ padding:'4px 16px 12px', borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={onClose} style={{ fontFamily:T.sans, fontSize:15, color:T.tint, background:'none', border:'none', cursor:'pointer', padding:0 }}>‹ Office</button>
          <div style={{ flex:1 }} />
          <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:600, color:STATUS[a.status].color, background:STATUS[a.status].color+'1a', padding:'3px 9px', borderRadius:999 }}>
            <StatusDot status={a.status} size={6} />{STATUS[a.status].label}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:11, marginTop:12 }}>
          <Headshot agent={a} size={46} radius={11} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:T.sans, fontSize:18, fontWeight:600 }}>{a.name}</div>
            <div style={{ fontFamily:T.mono, fontSize:10.5, color:T.faint }}>{a.project||'—'} · {a.branch||'idle'}</div>
          </div>
        </div>
        <div style={{ fontFamily:T.sans, fontSize:14, marginTop:10 }}>{a.task}</div>
        <div style={{ display:'flex', gap:2, marginTop:12, marginBottom:-12 }}>
          {['output','diff'].map(t => (
            <button key={t} onClick={()=>setTab(t)} style={{ fontFamily:T.sans, fontSize:12.5, fontWeight:600, textTransform:'capitalize',
              color:tab===t?T.text:T.muted, background:'none', border:'none', borderBottom:`2px solid ${tab===t?T.tint:'transparent'}`, padding:'7px 12px', cursor:'pointer' }}>{t}</button>
          ))}
        </div>
      </div>
      <div ref={sc} style={{ flex:1, overflowY:'auto', background:T.surface, padding:'14px 16px' }}>
        {tab==='output' ? (
          <>
            {(a.out||[]).map((l,i) => { const c=l.startsWith('▸')?T.codex:l.startsWith('  ✓')?T.green:l.startsWith('  ✗')?T.danger:l.startsWith('  ')?T.muted:T.text;
              return <div key={i} style={{ fontFamily:T.mono, fontSize:11.5, lineHeight:1.6, color:c, whiteSpace:'pre-wrap' }}>{l}</div>; })}
            {live && <div style={{ display:'inline-block', width:7, height:14, background:T.green, animation:'blink 1s steps(1) infinite', marginTop:4 }} />}
          </>
        ) : <DiffView a={a} />}
      </div>
      <div style={{ padding:'12px 16px 30px', borderTop:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:10, background:'#fff' }}>
        <Diff add={a.add} del={a.del} />
        <div style={{ flex:1 }} />
        {live && <button onClick={onDiscard} style={mbtn(T.surface2,T.text)}>Stop</button>}
        {a.status==='done' && <><button onClick={onDiscard} style={mbtn(T.surface2,T.text)}>Discard</button><button onClick={onMerge} style={mbtn(T.tint,'#fff')}>Merge ✓</button></>}
        {a.status==='error' && <><button onClick={onDiscard} style={mbtn(T.surface2,T.text)}>Discard</button><button onClick={onRetry} style={mbtn(T.tint,'#fff')}>Retry</button></>}
      </div>
    </div>
  );
}

function MobileApp() {
  const [agents,setAgents]=React.useState(initialAgents);
  const [tasks,setTasks]=React.useState(()=>QUEUE.map(q=>({...q})));
  const [seg,setSeg]=React.useState('working');
  const [sel,setSel]=React.useState(null);
  const tick=React.useRef(0);
  React.useEffect(()=>{ const id=setInterval(()=>{ tick.current++;
    setAgents(prev=>prev.map(a=>{ if(a.status!=='running') return a;
      const prog=Math.min(1,a.prog+0.045+Math.random()*0.02), line=streamLine(a,tick.current+(a.seat||0));
      const out=[...a.out,line].slice(-60), base={...a,prog,secs:a.secs+2,add:a.add+Math.floor(Math.random()*9),line,out,files:a.files+(Math.random()<0.15?1:0)};
      return prog>=1?{...base,status:'done',line:'finished — ready to merge',out:[...out,'  ✓ done — ready to merge']}:base; }));
  },1100); return ()=>clearInterval(id); },[]);

  const free=agents.filter(a=>a.status==='idle'), working=agents.filter(a=>a.status==='running'), review=agents.filter(a=>a.status==='done'||a.status==='error');
  const selA=agents.find(a=>a.id===sel);
  function dispatch(task,id){ setTasks(ts=>ts.filter(t=>t.id!==task.id)); setAgents(as=>as.map(a=>a.id!==id?a:({...a,status:'running',project:task.project,branch:`feat/${task.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').split('-').slice(0,3).join('-')}`,task:task.title,line:'starting…',prog:0.04,secs:0,add:0,del:0,files:1,out:['▸ booting agent','▸ checkout main']}))); }
  function assignFirst(task){ const a=free.find(x=>eligible(task.role,x.provider)); if(a) dispatch(task,a.id); }
  function freeUp(id){ setSel(null); setAgents(as=>as.map(a=>a.id!==id?a:({...a,status:'idle',project:null,branch:null,task:'Awaiting assignment',line:'Idle',prog:0,add:0,del:0,files:0,secs:0,out:[]}))); }
  function retry(id){ setAgents(as=>as.map(a=>a.id!==id?a:({...a,status:'running',line:'retrying…',prog:0.2,out:[...a.out,'▸ retry from checkpoint']}))); }

  const list = { flex:1, overflowY:'auto', padding:'0 16px 86px' };
  return (
    <PhoneFrame>
      <MStatusBar />
      <div style={{ padding:'2px 16px 10px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontFamily:T.mono, fontWeight:700, fontSize:19, color:T.text }}>pilot</span>
        <span style={{ fontFamily:T.sans, fontSize:15, color:T.muted, fontWeight:500 }}>Office</span>
        <div style={{ flex:1 }} />
        <span style={{ width:32, height:32, borderRadius:'50%', background:T.tint, color:'#fff', fontSize:20, fontWeight:500, display:'flex', alignItems:'center', justifyContent:'center' }}>+</span>
      </div>
      <Seg value={seg} onChange={setSeg} items={[['working','Working ',working.length],['queue','Queue ',tasks.length],['review','Review ',review.length]]} />

      <div style={list}>
        {seg==='working' && (working.length ? working.map(a=><MWorking key={a.id} a={a} onOpen={()=>setSel(a.id)} />)
          : <div style={{ textAlign:'center', color:T.faint, fontFamily:T.mono, fontSize:12, padding:'40px 0' }}>nobody’s coding</div>)}
        {seg==='queue' && (<>
          {tasks.map(q=><MQueue key={q.id} q={q} freeAgents={free} onAssign={()=>assignFirst(q)} />)}
          <div style={{ fontFamily:T.mono, fontSize:9.5, color:T.faint, textTransform:'uppercase', letterSpacing:'.1em', margin:'6px 2px 8px' }}>Free agents · {free.length}</div>
          {free.map(a=>(
            <div key={a.id} style={{ display:'flex', alignItems:'center', gap:11, background:T.card, border:`1px solid ${T.border}`, borderRadius:13, padding:'9px 11px', marginBottom:8 }}>
              <Headshot agent={a} size={36} radius={9} />
              <div><div style={{ fontFamily:T.sans, fontSize:13.5, fontWeight:600 }}>{a.name}</div><div style={{ fontFamily:T.mono, fontSize:10, color:T.faint }}>free · ready</div></div>
            </div>
          ))}
        </>)}
        {seg==='review' && (review.length ? review.map(a=><MReview key={a.id} a={a} onOpen={()=>setSel(a.id)} onMerge={()=>freeUp(a.id)} onRetry={()=>retry(a.id)} />)
          : <div style={{ textAlign:'center', color:T.faint, fontFamily:T.mono, fontSize:12, padding:'40px 0' }}>nothing to review</div>)}
      </div>

      {selA && <MSession a={selA} onClose={()=>setSel(null)} onMerge={()=>freeUp(selA.id)} onDiscard={()=>freeUp(selA.id)} onRetry={()=>retry(selA.id)} />}
      <MTabBar active="Office" />
    </PhoneFrame>
  );
}

window.MobileApp = MobileApp;
