/* ============================================================================
   PILOT — UI utilities · command palette, theme, sparklines
   Loaded after pilot-data.js, before pilot-app.js. Exposes globals.
   ========================================================================== */

/* ---- theme ---------------------------------------------------------------- */
function currentTheme() { return document.documentElement.dataset.theme || 'light'; }
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('pilot.theme2', next);
  if (typeof render === 'function') render();
}
function themeIcon() {
  return currentTheme() === 'dark'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>`;
}

/* ---- sparkline ------------------------------------------------------------ */
function spark(vals, w = 52, h = 18, color) {
  const max = Math.max(...vals), min = Math.min(...vals), span = (max - min) || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * (w - 2) + 1;
    const y = h - 1 - ((v - min) / span) * (h - 3);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = pts.split(' ').pop().split(',');
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
    <polyline points="${pts}" stroke="${color || 'var(--indigo)'}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="1.7" fill="${color || 'var(--indigo)'}"/>
  </svg>`;
}

/* ---- command palette ------------------------------------------------------ */
const CMDK = { open: false, q: '', active: 0, items: [], filtered: [], el: null };

function buildPaletteItems() {
  const items = [];
  const dark = currentTheme() === 'dark';
  // actions
  items.push({ kind: 'Go', label: 'Today', sub: 'Dashboard', run: () => navigate('today') });
  items.push({ kind: 'Go', label: 'Agents', sub: 'Team directory', run: () => navigate('agents') });
  items.push({ kind: 'Go', label: 'Projects', sub: 'All projects', run: () => navigate('projects') });
  items.push({ kind: 'Action', label: dark ? 'Switch to light' : 'Switch to dark', sub: 'Theme', run: () => toggleTheme() });
  items.push({ kind: 'Action', label: 'New task', sub: 'Dispatch work', run: () => toast('Dispatch flow would open here') });
  // projects
  PROJECTS.forEach(p => items.push({ kind: 'Project', label: p.name, sub: p.repo, run: () => navigate('board:' + p.id) }));
  // agents
  EMPLOYEES.forEach(e => {
    const s = SESSIONS.find(x => x.status === 'running' && x.agentId === e.id);
    items.push({ kind: 'Agent', label: e.name, sub: `${DEPTS[e.dept].name} · ${e.role}`, run: () => s ? navigate('session:' + s.id) : toast(`${e.name} is idle`) });
  });
  // sessions
  SESSIONS.forEach(s => {
    const t = task(s.taskId); if (!t) return;
    items.push({ kind: 'Session', label: t.title, sub: `${emp(s.agentId).name} · ${proj(s.projectId).name}`, run: () => navigate('session:' + s.id) });
  });
  return items;
}

function ensurePalette() {
  if (CMDK.el) return;
  const o = document.createElement('div');
  o.className = 'cmdk-overlay';
  o.innerHTML = `
    <div class="cmdk" role="dialog" aria-label="Command palette">
      <input class="cmdk-input" placeholder="Search agents, projects, sessions…" autocomplete="off" spellcheck="false" />
      <div class="cmdk-list"></div>
      <div class="cmdk-foot">
        <span>↑↓&nbsp; navigate</span><span>↵&nbsp; open</span><span>esc&nbsp; close</span>
        <span style="margin-left:auto">pilot</span>
      </div>
    </div>`;
  document.body.appendChild(o);
  CMDK.el = o;
  const input = o.querySelector('.cmdk-input');
  o.addEventListener('mousedown', e => { if (e.target === o) closePalette(); });
  input.addEventListener('input', () => { CMDK.q = input.value; CMDK.active = 0; filterPalette(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); CMDK.active = Math.min(CMDK.active + 1, CMDK.filtered.length - 1); paintPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); CMDK.active = Math.max(CMDK.active - 1, 0); paintPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
}

function openPalette() {
  ensurePalette();
  CMDK.items = buildPaletteItems();
  CMDK.q = ''; CMDK.active = 0;
  const input = CMDK.el.querySelector('.cmdk-input');
  input.value = '';
  filterPalette();
  CMDK.el.classList.add('show');
  CMDK.open = true;
  setTimeout(() => input.focus(), 20);
}
function closePalette() { if (CMDK.el) { CMDK.el.classList.remove('show'); CMDK.open = false; } }

function filterPalette() {
  const q = CMDK.q.trim().toLowerCase();
  CMDK.filtered = !q ? CMDK.items : CMDK.items.filter(it =>
    (it.label + ' ' + it.sub + ' ' + it.kind).toLowerCase().includes(q));
  paintPalette();
}
function paintPalette() {
  const list = CMDK.el.querySelector('.cmdk-list');
  if (!CMDK.filtered.length) { list.innerHTML = `<div class="cmdk-empty">Nothing matches “${CMDK.q}”.</div>`; return; }
  list.innerHTML = CMDK.filtered.map((it, i) => `
    <div class="cmdk-item ${i === CMDK.active ? 'active' : ''}" data-i="${i}">
      <span class="cmdk-kind">${it.kind}</span>
      <span style="flex:1;min-width:0">
        <span class="cmdk-label">${it.label}</span>
        <span class="cmdk-sub"> &nbsp;${it.sub}</span>
      </span>
    </div>`).join('');
  list.querySelectorAll('.cmdk-item').forEach(el => {
    el.addEventListener('mousemove', () => { CMDK.active = +el.dataset.i; paintPalette(); });
    el.addEventListener('click', () => { CMDK.active = +el.dataset.i; runActive(); });
  });
  // keep active visible without scrollIntoView
  const act = list.querySelector('.cmdk-item.active');
  if (act) {
    const lt = list.scrollTop, lb = lt + list.clientHeight;
    if (act.offsetTop < lt) list.scrollTop = act.offsetTop - 8;
    else if (act.offsetTop + act.offsetHeight > lb) list.scrollTop = act.offsetTop + act.offsetHeight - list.clientHeight + 8;
  }
}
function runActive() {
  const it = CMDK.filtered[CMDK.active];
  if (!it) return;
  closePalette();
  setTimeout(() => it.run(), 10);
}

/* global ⌘K / Ctrl-K */
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); CMDK.open ? closePalette() : openPalette(); }
  else if (e.key === '/' && !CMDK.open && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
});
