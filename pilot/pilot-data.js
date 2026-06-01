/* ============================================================================
   PILOT — mock data (shapes mirror web/src/api/client.ts)
   ========================================================================== */

const DEPTS = {
  eng:  { id: 'eng',  name: 'Engineering', color: '#4b3bff' },
  des:  { id: 'des',  name: 'Design',      color: '#1f9d57' },
  res:  { id: 'res',  name: 'Research',    color: '#c7901f' },
};

const EMPLOYEES = [
  { id: 'e1', name: 'Mara',  initials: 'MA', provider: 'claude', role: 'lead',     dept: 'eng', onShift: true },
  { id: 'e2', name: 'Devon', initials: 'DV', provider: 'codex',  role: 'worker',   dept: 'eng', onShift: true },
  { id: 'e3', name: 'Priya', initials: 'PR', provider: 'claude', role: 'worker',   dept: 'eng', onShift: true },
  { id: 'e4', name: 'Lena',  initials: 'LE', provider: 'claude', role: 'reviewer', dept: 'des', onShift: false },
  { id: 'e5', name: 'Sol',   initials: 'SO', provider: 'codex',  role: 'worker',   dept: 'des', onShift: false },
  { id: 'e6', name: 'Rai',   initials: 'RA', provider: 'claude', role: 'planner',  dept: 'res', onShift: true },
  { id: 'e7', name: 'Ana',   initials: 'AN', provider: 'claude', role: 'worker',   dept: 'res', onShift: true },
];

/* shift = the current working window (workforce metaphor) */
const SHIFT = { name: 'Day shift', startsAt: '09:00', endsAt: '18:00' };

/* lightweight trends for sparklines (last ~10 buckets) */
const TRENDS = {
  shift:    [4, 5, 5, 6, 5, 5, 4, 5, 5, 5],
  merged:   [2, 4, 3, 6, 5, 7, 6, 9, 8, 12],
  avgTime:  [9, 8, 8, 10, 7, 7, 8, 6, 7, 7],
  queue:    [3, 4, 6, 5, 7, 6, 8, 6, 5, 5],
};

const PROJECTS = [
  { id: 'p1', name: 'Acme App',         repo: 'acme/app',          role: 'any' },
  { id: 'p2', name: 'Billing Service',  repo: 'acme/billing',      role: 'claude' },
  { id: 'p3', name: 'Marketing Site',   repo: 'acme/marketing',    role: 'any' },
  { id: 'p4', name: 'Mobile',           repo: 'acme/mobile',       role: 'codex' },
];

/* sessions: running + waiting-for-review */
const SESSIONS = [
  { id: 's1', agentId: 'e2', projectId: 'p1', taskId: 't1', status: 'running', startedAt: mAgo(4 * 60 + 21), tokens: 38200, files: 7, cost: 0.42 },
  { id: 's2', agentId: 'e6', projectId: 'p2', taskId: 't2', status: 'running', startedAt: mAgo(11 * 60 + 9), tokens: 71400, files: 3, cost: 0.91 },
  { id: 's3', agentId: 'e3', projectId: 'p1', taskId: 't3', status: 'running', startedAt: mAgo(48),          tokens: 4100,  files: 2, cost: 0.06 },
  { id: 's4', agentId: 'e1', projectId: 'p1', taskId: 't4', status: 'done',  verdict: 'approved',          tokens: 52900, files: 11, cost: 0.63 },
  { id: 's5', agentId: 'e4', projectId: 'p3', taskId: 't5', status: 'done',  verdict: 'changes_requested', tokens: 18800, files: 4,  cost: 0.22 },
];

/* tasks */
const TASKS = [
  { id: 't1', projectId: 'p1', title: 'Refactor the auth session flow',      size: 'm',  status: 'running', agentId: 'e2' },
  { id: 't2', projectId: 'p2', title: 'Investigate the flaky billing test suite', size: 'l', status: 'running', agentId: 'e6' },
  { id: 't3', projectId: 'p1', title: 'Add rate limiting to the public API',  size: 's',  status: 'running', agentId: 'e3' },
  { id: 't4', projectId: 'p1', title: 'Migrate data layer to React Query v5', size: 'l',  status: 'done',    agentId: 'e1' },
  { id: 't5', projectId: 'p3', title: 'Redesign the empty states',            size: 'm',  status: 'done',    agentId: 'e4' },
  // queued
  { id: 't6', projectId: 'p1', title: 'Paginate the activity feed endpoint',  size: 's',  status: 'pending' },
  { id: 't7', projectId: 'p1', title: 'Dark-mode audit of the settings page', size: 'm',  status: 'pending' },
  { id: 't8', projectId: 'p2', title: 'Add idempotency keys to charge calls', size: 'm',  status: 'pending' },
  { id: 't9', projectId: 'p4', title: 'Fix crash on cold launch (Android 14)',size: 's',  status: 'pending' },
  { id: 't10',projectId: 'p3', title: 'Compress hero imagery, lazy-load fold',size: 'xs', status: 'pending' },
];

/* activity feed */
const EVENTS = [
  { id: 'ev1', type: 'merged',    who: 'e1', task: 'Cache the project file tree',           when: mAgo(14) },
  { id: 'ev2', type: 'done',      who: 'e2', task: 'Refactor the auth session flow',        when: mAgo(2) },
  { id: 'ev3', type: 'started',   who: 'e3', task: 'Add rate limiting to the public API',   when: mAgo(48) },
  { id: 'ev4', type: 'failed',    who: 'e5', task: 'Wire up the new icon set',              when: mAgo(63) },
  { id: 'ev5', type: 'review',    who: 'e4', task: 'Redesign the empty states',             when: mAgo(70) },
  { id: 'ev6', type: 'merged',    who: 'e7', task: 'Summarise the weekly research digest',  when: mAgo(96) },
  { id: 'ev7', type: 'started',   who: 'e6', task: 'Investigate the flaky billing test suite', when: mAgo(110) },
];

/* a rich story for the focused session (s1 — Devon, auth refactor) */
const STORY = [
  { act: false, html: 'I started by reading through how sessions are created today, mapping every place a token gets minted.', tool: 'Read · src/auth/session.ts' },
  { act: true,  html: 'There were <span class="toolref">three</span> separate call sites doing it by hand. I pulled them into a single <span class="toolref">issueToken()</span> helper so the rules live in one place.' },
  { act: false, html: 'Then I threaded the new helper through the login, refresh, and impersonation paths, deleting the duplicated expiry math as I went.', tool: 'Edit · src/auth/session.ts' },
  { act: true,  html: 'Ran the suite — <span class="toolref">41 passing</span>, nothing red. I also added a focused test for the refresh edge case that used to be implicit.' },
  { act: false, html: 'Last thing: a short changelog note so the next person knows the token shape moved.', tool: 'Write · CHANGELOG.md' },
];

const TERM = [
  ['▸ Read  src/auth/session.ts', 'tool'],
  ['Mapping current token creation across the codebase…', 'txt'],
  ['▸ Grep  "new Token(" — 3 matches', 'tool'],
  ['▸ Edit  src/auth/session.ts  (+128 −44)', 'tool'],
  ['▸ Edit  src/auth/login.ts', 'tool'],
  ['▸ Bash  npm test -- auth', 'tool'],
  ['  ✓ 41 passing  (2.4s)', 'ok'],
  ['Consolidated token minting into issueToken(). Adding changelog.', 'txt'],
  ['▸ Write CHANGELOG.md', 'tool'],
  ['done · exit 0', 'dim'],
];

const DIFF = [
  ['diff --git a/src/auth/session.ts b/src/auth/session.ts', 'meta'],
  ['@@ -18,9 +18,7 @@ export function login(user) {', 'hunk'],
  ['-  const exp = Date.now() + 1000 * 60 * 60', 'del'],
  ['-  const token = new Token(user.id, exp)', 'del'],
  ['-  token.sign(SECRET)', 'del'],
  ['+  const token = issueToken(user.id)', 'add'],
  ['   return token', 'txt'],
  ['@@ -41,6 +39,12 @@', 'hunk'],
  ['+export function issueToken(userId) {', 'add'],
  ['+  const exp = Date.now() + TOKEN_TTL', 'add'],
  ['+  return new Token(userId, exp).sign(SECRET)', 'add'],
  ['+}', 'add'],
];

/* ---- helpers --------------------------------------------------------------*/
function mAgo(mins) { return Date.now() - mins * 60_000; }
function emp(id) { return EMPLOYEES.find(e => e.id === id); }
function proj(id) { return PROJECTS.find(p => p.id === id); }
function task(id) { return TASKS.find(t => t.id === id); }
function deptOf(e) { return DEPTS[e.dept]; }

function elapsed(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  const m = Math.floor(s / 60), ss = s % 60;
  if (m >= 60) { const h = Math.floor(m / 60); return `${h}:${String(m % 60).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }
  return `${m}:${String(ss).padStart(2, '0')}`;
}
function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function k(n) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
