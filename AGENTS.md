# pilotapp

An AI agent team management platform. You direct a crew of AI coding agents — they work on separate git branches in parallel, you review and merge their output. Self-hosted, server-first.

## Architecture

```
server/   Node.js + Express + SQLite (better-sqlite3) + WebSocket
web/      React 19 + Vite + Tailwind v4 + TanStack Query
app/      Swift/SwiftUI iOS + macOS client
```

The server is the source of truth. Web UI and iOS/Mac client are both clients to the same REST + WebSocket API. Agents run as spawned subprocesses (`Codex` or `codex` CLI) inside git worktrees.

## How it works

1. Add a project (GitHub clone, local path, or empty repo)
2. Add connections (Anthropic/OpenAI API keys) and agents (named, with personalities)
3. Create tasks with a title + prompt + base branch
4. Assign tasks to agents — each gets a git worktree, runs the CLI, streams output
5. Review the diff, merge to main, optionally push to remote

## Key data model

- **Projects** — bare git repos on disk, with optional GitHub remote
- **Connections** — API credentials (or machine auth / OAuth subscription)
- **Agents** — named personas backed by a connection; have a provider (Codex/codex)
- **Tasks** — title + prompt + base branch + priority queue
- **Sessions** — one agent, one worktree, one branch; status: idle → running → done/error → merged
- **Specs** — AI-written planning documents (SPEC.md) that can be executed as tasks

## Server internals

- `services/agents.ts` — spawns CLI process, buffers output, broadcasts via WebSocket, writes `.log` file per session
- `services/git.ts` — worktree create/remove/merge, diff, push via simple-git
- `services/socket.ts` — WebSocket auth + subscribe/run message handling
- `db/index.ts` — SQLite schema + indexes + try/catch migrations
- Sessions persist log files in `DATA_DIR` — survive server restarts

## Web UI key pages

- `/` — ProjectsPage: project list with live activity counts
- `/projects/:id` — ProjectDetailPage: kanban board (Queue / Working / Review)
- `/projects/:id/sessions` — SessionsPage: session list with status filter
- `/projects/:id/plans` — PlansPage: spec management
- `/projects/:id/files` — FilesPage: file browser with syntax highlighting
- `/projects/:id/settings` — ProjectSettingsPage
- `/sessions/:id` — SessionPage: live output, diff, merge/discard
- `/settings` — SettingsPage: connections, agents, theme

## Design system

- Dark-first (Railway-inspired), oklch color system, light mode supported
- Type scale: 10px (micro) / 11px (caption) / 12px = text-xs (label) / 14px = text-sm (body) / 16px = text-base (wordmark) / 24px = text-2xl (headings)
- Card contrast: `oklch(0.155)` on `oklch(0.095)` background
- Agent avatars: pixel art faces for named agents (atlas, bishop, cleo, codex, dex, fern, gil)
- Shared components: `AgentAvatar`, `EmptyState`, `Skeleton`, `ViewToggle`
- Shared utils: `lib/time.ts` (fmtSecs, useElapsed), `lib/utils.ts` (cn)

## Session status lifecycle

`idle` → `running` → `done` | `error` → `merged`

Merge updates DB status to `merged`. Board only shows `done | error` in Review column. `merged` sessions are visible in Sessions list with a Merged badge.

## Environment variables

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | 3000 | Server port |
| `DATA_DIR` | `./data` | SQLite db + session logs + repos |
| `JWT_SECRET` | `change-me-in-production` | Warns loudly if unset outside dev |
| `ANTHROPIC_API_KEY` | — | Fallback key for all Codex sessions |
| `OPENAI_API_KEY` | — | Fallback key for all codex sessions |
| `ALLOW_REGISTRATION` | — | Set to `true` to allow more than first user |
| `NODE_ENV` | — | Set to `development` to suppress JWT warning |

First boot: registration auto-allowed for first user only. Subsequent registrations blocked unless `ALLOW_REGISTRATION=true`.

## Product vision

The "office" metaphor: agents are like employees. You set the work, they execute it, you review and merge. The intended experience is closer to managing a small development team than operating a CI/CD pipeline.

**Near-term direction:**
- Agent personality cards — per-agent prompt prefix shaping how they approach work
- Session journals — handoff notes that chain across sessions on the same task, giving continuity
- Peer review — a second agent reviews a diff before merge; structured approve/reject output
- Teams + lead agent — a coordinating agent that breaks down a brief, assigns subtasks, monitors and reconciles
- Shifts — batch of tasks an agent works through unattended; morning report on completion
- Activity feed — human-readable summary of what agents did, not raw logs

**iOS/Mac client direction:**
- Push notifications (APNs) for session events — done, error, needs review
- Live Activities for active sessions (Dynamic Island, lock screen)
- Home screen widgets for office status
- QR code pairing to connect to self-hosted server
- Menu bar app (macOS) with quick merge/discard actions
- Ambient floor plan view — glanceable office state from the phone

## Dev setup (TODO: root-level concurrently script)

```bash
cd server && npm run dev   # :3000
cd web    && npm run dev   # :5173, proxies API to :3000
```
