/* ============================================================================
   PILOT — Editorial prototype · app + router  (v2)
   ========================================================================== */

/* ---- icon set ------------------------------------------------------------- */
const I = {
  // distinctive mark: a small dispatch constellation — one lead node + two reports
  mark: `<svg class="mk" viewBox="0 0 24 24" fill="none">
    <path d="M12 5.5 L5.5 18 M12 5.5 L18.5 18 M5.5 18 L18.5 18" stroke="currentColor" stroke-width="1.3" opacity="0.38" stroke-linejoin="round"/>
    <circle cx="12" cy="5.5" r="3.1" fill="currentColor"/>
    <circle cx="5.5" cy="18" r="2.3" fill="currentColor" opacity="0.55"/>
    <circle cx="18.5" cy="18" r="2.3" fill="currentColor" opacity="0.55"/>
  </svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  arr:  `<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`,
  search:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>`,
  caret:`<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
};

/* ---- avatar --------------------------------------------------------------- */
function avatar(e, size = '', running = false) {
  if (!e) return `<span class="av ${size}">—</span>`;
  return `<span class="av ${size}${running ? ' ring-green' : ''}">${e.initials}</span>`;
}
function avatarPip(e, status) {
  const color = status === 'running' ? 'var(--green-dot)' : status === 'shift' ? 'var(--indigo)' : 'var(--faint)';
  return `<span class="avwrap">${avatar(e)}<span class="pip" style="background:${color}"></span></span>`;
}
const hint = `<span class="row-hint mono">↵</span>`;

/* ---- narration ------------------------------------------------------------ */
function narrate(ev) {
  const e = emp(ev.who);
  const map = {
    started: ['started', 'var(--muted)'],
    done:    ['finished', 'var(--green)'],
    merged:  ['merged', 'var(--indigo)'],
    failed:  ['ran into an error on', 'var(--red)'],
    review:  ['requested review on', 'var(--amber)'],
  };
  const [v, c] = map[ev.type] || ['updated', 'var(--muted)'];
  return `<b>${e.name}</b> <span style="color:${c}">${v}</span> ${ev.task}.`;
}

/* ---- review helpers ------------------------------------------------------- */
function reviewSessions(pid) {
  return SESSIONS.filter(s => s.status === 'done' && !s.reviewed && (!pid || s.projectId === pid));
}
function verdictPill(s) {
  return s.verdict === 'approved'
    ? `<span class="stat green"><span class="dot green"></span>Approved by reviewer</span>`
    : `<span class="stat amber"><span class="dot amber"></span>Changes suggested</span>`;
}

/* ---- collapsible section -------------------------------------------------- */
function sectionBlock(id, title, count, body, opts = {}) {
  const collapsed = state.collapsed.has(id);
  return `<section class="section ${opts.attention ? 'attention' : ''} ${collapsed ? 'collapsed' : ''}" data-sec="${id}">
    <div class="section-head">
      <button class="toggle" data-collapse="${id}">
        ${I.caret}
        <h2 class="h-section">${title}</h2>
        ${count != null ? `<span class="count">${count}</span>` : ''}
      </button>
      ${opts.seeall ? `<a class="seeall" data-toast="Full history">All${I.arr}</a>` : ''}
    </div>
    ${body}
  </section>`;
}

/* ---- shell ---------------------------------------------------------------- */
const NAV = [
  { id: 'today', label: 'Today' },
  { id: 'agents', label: 'Agents' },
  { id: 'projects', label: 'Projects' },
  { id: 'knowledge', label: 'Knowledge' },
];

function shell(activeNav, inner, readWidth = false) {
  const rc = reviewSessions().length;
  const links = NAV.map(n => {
    const badge = n.id === 'today' && rc ? `<span class="badge">${rc}</span>` : '';
    return `<button class="navlink ${n.id === activeNav ? 'on' : ''}" data-go="${n.id}">${n.label}${badge}</button>`;
  }).join('');
  return `
    <nav class="topnav">
      <button class="wordmark" data-go="today">${I.mark}pilot</button>
      <div class="navlinks">${links}</div>
      <div class="navspacer"></div>
      <div class="navright">
        <button class="navtool" data-action="palette" title="Search — ⌘K">${I.search}<span class="kbd">⌘K</span></button>
        <button class="navtool icon" data-action="theme" title="Toggle theme">${themeIcon()}</button>
        <button class="newbtn" data-toast="Dispatch flow would open here">${I.plus}<span>New task</span></button>
        <span class="av sm" title="You">JD</span>
      </div>
    </nav>
    <div class="page${readWidth ? ' read' : ''} viewfade">${inner}</div>
    <div class="spacer-lg"></div>`;
}

/* ============================================================================
   TODAY
   ========================================================================== */
function viewToday() {
  const running = SESSIONS.filter(s => s.status === 'running');
  const review = reviewSessions();
  const queued = TASKS.filter(t => t.status === 'pending');
  const onShift = EMPLOYEES.filter(e => e.onShift).length;
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const lede = review.length
    ? `<span class="num">${running.length}</span> agents are working.
       <span class="num">${review.length}</span> ${review.length === 1 ? 'change is' : 'changes are'} waiting for your review,
       and <span class="num">${queued.length}</span> tasks are queued.`
    : `<span class="num">${running.length}</span> agents are working. Nothing needs your review —
       <span class="num">${queued.length}</span> tasks are queued and moving.`;

  const metrics = [
    { v: `${onShift}/${EMPLOYEES.length}`, l: 'On shift', t: TRENDS.shift, c: 'var(--green-dot)' },
    { v: '12', l: 'Merged today', t: TRENDS.merged, c: 'var(--indigo)' },
    { v: '7m', l: 'Avg session', t: TRENDS.avgTime, c: 'var(--faint)' },
    { v: String(queued.length), l: 'Queue depth', t: TRENDS.queue, c: 'var(--amber-dot)' },
  ].map(m => `<div class="metric">
      <div class="mtop"><span class="mv tnum">${m.v}</span>${spark(m.t, 52, 18, m.c)}</div>
      <span class="ml">${m.l}</span>
    </div>`).join('');

  const reviewRows = review.map(s => {
    const e = emp(s.agentId), t = task(s.taskId), p = proj(s.projectId);
    return `<div class="reviewrow">
      ${avatar(e)}
      <button class="row-open" data-go="session:${s.id}">
        <div class="row-title">${t.title}</div>
        <div class="row-meta">${e.name}<span class="sep">·</span>${p.name}<span class="sep">·</span>${verdictPill(s)}</div>
      </button>
      <div class="review-actions">
        <button class="btn sm primary" data-approve="${s.id}">${I.check}Approve</button>
        <button class="btn sm" data-changes="${s.id}">Request changes</button>
      </div>
    </div>`;
  }).join('');

  const reviewBody = review.length
    ? `<div class="rows accent">${reviewRows}</div>`
    : `<p class="emptyline">You're all caught up.</p>`;

  const runRows = running.map(s => {
    const e = emp(s.agentId), t = task(s.taskId), p = proj(s.projectId);
    return `<button class="row quiet" data-go="session:${s.id}">
      <span class="dot green pulse"></span>${avatar(e, 'sm')}
      <div class="row-main"><div class="row-title">${t.title}</div><div class="row-meta">${e.name}<span class="sep">·</span>${p.name}</div></div>
      ${hint}<span class="row-time tnum" data-elapsed="${s.startedAt}">${elapsed(s.startedAt)}</span>
    </button>`;
  }).join('');

  const feed = EVENTS.map(ev => `<button class="feedrow" data-toast="Open this event">
      <span class="fsentence">${narrate(ev)}</span>
      <span class="when">${ago(ev.when)}</span>
    </button>`).join('');

  const inner = `
    <header style="padding-top:54px">
      <div class="eyebrow" style="margin-bottom:14px">${date} · ${SHIFT.name} ${SHIFT.startsAt}–${SHIFT.endsAt}</div>
      <h1 class="h-page">Today</h1>
      <p class="lede" style="margin-top:22px">${lede}</p>
    </header>
    <div class="metrics">${metrics}</div>
    ${sectionBlock('today-review', 'Waiting for you', review.length || null, reviewBody, { attention: true })}
    ${sectionBlock('today-running', 'In progress', running.length, `<div class="rows">${runRows}</div>`)}
    ${sectionBlock('today-activity', 'Activity', null, `<div class="feed">${feed}</div>`, { seeall: true })}`;

  return shell('today', inner, true);
}

/* ============================================================================
   SESSION
   ========================================================================== */
function viewSession(id) {
  const s = SESSIONS.find(x => x.id === id) || SESSIONS[0];
  const e = emp(s.agentId), t = task(s.taskId), p = proj(s.projectId);
  const running = s.status === 'running';
  const tab = state.sessionTab || 'story';

  const statusLabel = running
    ? `<span class="stat green"><span class="dot green pulse"></span>Running</span>`
    : s.reviewed ? `<span class="stat green"><span class="dot green"></span>Reviewed</span>`
    : s.verdict === 'approved'
      ? `<span class="stat green"><span class="dot green"></span>Approved by reviewer</span>`
      : `<span class="stat amber"><span class="dot amber"></span>Changes suggested</span>`;

  const actions = running
    ? `<button class="btn sm" data-toast="Session stopped">Stop</button>
       <button class="btn sm danger" data-toast="Discarded">Discard</button>`
    : `<button class="btn sm" data-tab="diff">View diff</button>
       <button class="btn sm" data-changes="${s.id}">Request changes</button>
       <button class="btn sm primary" data-approve="${s.id}">${I.check}Approve &amp; merge</button>`;

  const telem = [
    ['tv-elapsed', running ? elapsed(s.startedAt) : '04:21', 'Elapsed'],
    [null, k(s.tokens), 'Tokens'],
    [null, String(s.files), 'Files'],
    [null, '$' + s.cost.toFixed(2), 'Cost'],
  ].map(([cls, v, l]) => `<div class="t"><span class="tv tnum"${cls ? ` id="${cls}"` : ''}>${v}</span><span class="tl">${l}</span></div>`).join('');

  const tabs = ['story', 'output', 'diff'].map(x =>
    `<button class="tab ${x === tab ? 'on' : ''}" data-tab="${x}">${x === 'story' ? 'Story' : x === 'output' ? 'Output' : 'Diff'}</button>`).join('');

  let pane = '';
  if (tab === 'story') {
    pane = `<div class="story" id="story">
      ${STORY.map(b => `<div class="beat ${b.act ? 'act' : ''}"><span class="mk"></span><p>${b.html}${b.tool ? `<br><span class="toolref">${b.tool}</span>` : ''}</p></div>`).join('')}
      ${running ? `<div class="cursorbeat"><span class="curs"></span>still working…</div>` : ''}
    </div>`;
  } else if (tab === 'output') {
    pane = `<div class="term">${TERM.map(([tx, kd]) => `<div class="tl-${kd === 'tool' ? 'tool' : kd === 'ok' ? 'ok' : kd === 'dim' ? 'dim' : ''}">${tx}</div>`).join('')}${running ? '<span class="curs"></span>' : ''}</div>`;
  } else {
    pane = `<div class="diff">${DIFF.map(([tx, kd]) => `<div class="dl ${kd}">${tx.replace(/</g, '&lt;')}</div>`).join('')}</div>`;
  }

  const inner = `
    <div style="padding-top:34px">
      <button class="backlink" data-go="board:${p.id}">${I.back}${p.name}</button>
      <div class="sess-head">
        <div style="flex:1;min-width:0">
          <div class="row-title">${t.title}</div>
          <div class="sess-by">${avatar(e, '', running)} ${e.name}<span class="sep" style="color:var(--faint)">·</span>${statusLabel}</div>
        </div>
        <div class="sess-actions">${actions}</div>
      </div>
      <div class="telem">${telem}</div>
      <div class="tabs">${tabs}</div>
      <div class="pane">${pane}</div>
    </div>`;

  return shell('projects', inner, true);
}

/* ============================================================================
   AGENTS
   ========================================================================== */
function viewAgents() {
  const runningByAgent = new Map(SESSIONS.filter(s => s.status === 'running').map(s => [s.agentId, s]));
  const working = runningByAgent.size;
  const onShift = EMPLOYEES.filter(e => e.onShift).length;

  const groups = Object.values(DEPTS).map(d => {
    const members = EMPLOYEES.filter(e => e.dept === d.id);
    const dShift = members.filter(m => m.onShift).length;
    const pct = Math.round((dShift / members.length) * 100);
    const rows = members.map(e => {
      const s = runningByAgent.get(e.id);
      const t = s ? task(s.taskId) : null;
      let right, meta, pip;
      if (s) {
        pip = 'running';
        right = `<span class="row-time tnum" data-elapsed="${s.startedAt}">${elapsed(s.startedAt)}</span>`;
        meta = `<span style="color:var(--green)">working on</span> ${t.title}`;
      } else if (e.onShift) {
        pip = 'shift';
        right = `<span class="stat" style="color:var(--indigo)"><span class="dot" style="background:var(--indigo)"></span>on shift</span>`;
        meta = `${e.role} · ${e.provider} · between tasks`;
      } else {
        pip = 'idle';
        right = `<span class="stat" style="color:var(--faint)"><span class="dot idle"></span>off shift</span>`;
        meta = `${e.role} · ${e.provider}`;
      }
      return `<button class="row" ${s ? `data-go="session:${s.id}"` : 'data-toast="Agent profile"'}>
        ${avatarPip(e, pip)}
        <div class="row-main"><div class="row-title" style="font-size:17px">${e.name}</div><div class="row-meta">${meta}</div></div>
        ${hint}${right}
      </button>`;
    }).join('');
    return `<div class="deptgroup">
      <div class="dh">
        <span class="dl">${d.name}</span>
        <span class="dc">${dShift}/${members.length} on shift</span>
        <div class="util" title="${pct}% on shift"><span style="width:${pct}%"></span></div>
      </div>
      <div class="rows">${rows}</div>
    </div>`;
  }).join('');

  const inner = `
    <header style="padding-top:54px">
      <h1 class="h-page">Agents</h1>
      <p class="lede" style="margin-top:20px">${EMPLOYEES.length} teammates across three departments.
        <span class="num">${onShift}</span> on shift, <span class="num">${working}</span> on a task right now.</p>
    </header>
    ${groups}`;

  return shell('agents', inner);
}

/* ============================================================================
   PROJECTS
   ========================================================================== */
function viewProjects() {
  const rows = PROJECTS.map(p => {
    const run = SESSIONS.filter(s => s.status === 'running' && s.projectId === p.id).length;
    const rev = reviewSessions(p.id).length;
    const q = TASKS.filter(t => t.status === 'pending' && t.projectId === p.id).length;
    const bits = [];
    if (run) bits.push(`<span class="stat green"><span class="dot green"></span>${run} running</span>`);
    if (rev) bits.push(`<span class="stat amber"><span class="dot amber"></span>${rev} to review</span>`);
    if (q) bits.push(`<span class="muted">${q} queued</span>`);
    if (!bits.length) bits.push('<span class="muted">idle</span>');
    return `<button class="row" data-go="board:${p.id}">
      <div class="row-main">
        <div class="row-title" style="font-size:20px">${p.name}</div>
        <div class="row-meta"><span class="mono" style="font-size:12px">${p.repo}</span></div>
      </div>
      <div class="row-meta" style="margin:0;gap:16px">${bits.join('<span class="sep">·</span>')}</div>
      ${hint}<span class="row-go">${I.arr}</span>
    </button>`;
  }).join('');

  const inner = `
    <header style="padding-top:54px">
      <h1 class="h-page">Projects</h1>
      <p class="lede" style="margin-top:20px">Four repositories under active work.</p>
    </header>
    <section class="section" style="margin-top:40px"><div class="rows">${rows}</div></section>`;

  return shell('projects', inner, true);
}

/* ============================================================================
   BOARD
   ========================================================================== */
function viewBoard(pid) {
  const p = proj(pid) || PROJECTS[0];
  const mine = TASKS.filter(t => t.projectId === p.id);
  const review = reviewSessions(p.id);
  const running = mine.filter(t => t.status === 'running');
  const queued = mine.filter(t => t.status === 'pending');

  const PT = ['Board', 'Sessions', 'Plans', 'Files', 'Settings'];
  const ptabs = PT.map((x, i) => `<button class="tab ${i === 0 ? 'on' : ''}" ${i ? `data-toast="${x} view"` : ''}>${x}</button>`).join('');

  const reviewRows = review.map(s => {
    const e = emp(s.agentId), t = task(s.taskId);
    return `<div class="reviewrow">
      ${avatar(e, 'sm')}
      <button class="row-open" data-go="session:${s.id}">
        <div class="row-title">${t.title}</div><div class="row-meta">${e.name}<span class="sep">·</span>${verdictPill(s)}</div>
      </button>
      <div class="review-actions">
        <button class="btn sm primary" data-approve="${s.id}">${I.check}Approve</button>
        <button class="btn sm" data-changes="${s.id}">Changes</button>
      </div>
    </div>`;
  }).join('');

  const runRows = running.map(t => {
    const s = SESSIONS.find(x => x.taskId === t.id);
    const e = emp(t.agentId);
    return `<button class="row" data-go="session:${s ? s.id : 's1'}">
      <span class="dot green pulse"></span>${avatar(e, 'sm')}
      <div class="row-main"><div class="row-title">${t.title}</div><div class="row-meta">${e.name}</div></div>
      <span class="chip size">${t.size}</span>${hint}
      <span class="row-time tnum" ${s ? `data-elapsed="${s.startedAt}"` : ''}>${s ? elapsed(s.startedAt) : ''}</span>
    </button>`;
  }).join('');

  const queueRows = queued.map(t => `<button class="row quiet" data-toast="Assign “${t.title}”">
      <span class="dot idle"></span>
      <div class="row-main"><div class="row-title">${t.title}</div></div>
      <span class="chip size">${t.size}</span><span class="linkbtn">Assign${I.arr}</span>
    </button>`).join('');

  const inner = `
    <div style="padding-top:34px">
      <button class="backlink" data-go="projects">${I.back}Projects</button>
      <div class="sess-head">
        <div style="flex:1;min-width:0">
          <h1 class="h-page" style="font-size:38px">${p.name}</h1>
          <div class="row-meta" style="margin-top:10px"><span class="mono" style="font-size:12.5px">${p.repo}</span></div>
        </div>
        <div class="sess-actions"><button class="btn primary sm" data-toast="New task">${I.plus}New task</button></div>
      </div>
      <div class="proj-tabs">${ptabs}</div>
      ${review.length ? sectionBlock('b-review', 'Waiting for review', review.length, `<div class="rows accent">${reviewRows}</div>`, { attention: true }) : ''}
      ${running.length ? sectionBlock('b-running', 'Running', running.length, `<div class="rows">${runRows}</div>`) : ''}
      ${queued.length ? sectionBlock('b-queued', 'Queued', queued.length, `<div class="rows">${queueRows}</div>`) : ''}
    </div>`;

  return shell('projects', inner, true);
}

function viewSimple(title, sub) {
  return shell(state.route.split(':')[0], `<header style="padding-top:80px"><h1 class="h-page">${title}</h1><p class="lede" style="margin-top:20px">${sub}</p></header>`, true);
}

/* ============================================================================
   ROUTER + STATE
   ========================================================================== */
const state = { route: 'today', sessionTab: 'story', collapsed: new Set() };

function render() {
  const [name, arg] = state.route.split(':');
  let html;
  switch (name) {
    case 'today': html = viewToday(); break;
    case 'agents': html = viewAgents(); break;
    case 'projects': html = viewProjects(); break;
    case 'board': html = viewBoard(arg); break;
    case 'session': html = viewSession(arg); break;
    case 'knowledge': html = viewSimple('Knowledge', 'Company, department, and per-agent docs would live here.'); break;
    default: html = viewToday();
  }
  const app = document.getElementById('app');
  app.innerHTML = html;
  window.scrollTo(0, 0);
  wire();
  localStorage.setItem('pilot.route', state.route);
}

function navigate(route) {
  if (route.startsWith('session')) state.sessionTab = 'story';
  state.route = route;
  render();
}

/* ---- live ticking elapsed timers ----------------------------------------- */
setInterval(() => {
  document.querySelectorAll('[data-elapsed]').forEach(el => { el.textContent = elapsed(Number(el.dataset.elapsed)); });
}, 1000);

/* ---- toast ---------------------------------------------------------------- */
let toastEl, toastTimer;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
  toastEl.innerHTML = `<span class="dot"></span>${msg}`;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

/* ---- wire ----------------------------------------------------------------- */
function wire() {
  document.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); navigate(el.dataset.go); }));
  document.querySelectorAll('[data-toast]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); toast(el.dataset.toast); }));
  document.querySelectorAll('[data-tab]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); state.sessionTab = el.dataset.tab; render(); }));
  document.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    if (el.dataset.action === 'palette') openPalette();
    if (el.dataset.action === 'theme') toggleTheme();
  }));
  document.querySelectorAll('[data-collapse]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const id = el.dataset.collapse;
    if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
    el.closest('.section').classList.toggle('collapsed');
  }));
  document.querySelectorAll('[data-approve]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const s = SESSIONS.find(x => x.id === el.dataset.approve);
    if (s) { s.reviewed = true; s.status = 'merged'; }
    toast('Approved — merging ✓');
    if (state.route.startsWith('session')) navigate('today'); else render();
  }));
  document.querySelectorAll('[data-changes]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const s = SESSIONS.find(x => x.id === el.dataset.changes);
    if (s) s.reviewed = true;
    toast('Changes requested — sent back');
    if (state.route.startsWith('session')) navigate('today'); else render();
  }));

  // stagger the story beats in on a running session
  const story = document.getElementById('story');
  if (story) {
    [...story.querySelectorAll('.beat')].forEach((b, i) => {
      b.style.opacity = '0'; b.style.transform = 'translateY(8px)'; b.style.transition = 'opacity .5s, transform .5s';
      setTimeout(() => { b.style.opacity = '1'; b.style.transform = 'none'; }, 100 + i * 240);
    });
  }
}

/* ---- boot ----------------------------------------------------------------- */
document.documentElement.dataset.theme = localStorage.getItem('pilot.theme2') || 'light';
state.route = localStorage.getItem('pilot.route') || 'today';
render();
