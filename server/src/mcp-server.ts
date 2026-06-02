/**
 * Pilot internal MCP stdio server.
 * Spawned by Claude Code CLI via --mcp-config. Communicates with the main
 * server over loopback HTTP at PILOT_INTERNAL_URL.
 *
 * Protocol: JSON-RPC 2.0 over stdin/stdout (one JSON object per line).
 */

import http from 'http';
import readline from 'readline';

const SESSION_ID  = process.env.PILOT_SESSION_ID  ?? '';
const USER_ID     = process.env.PILOT_USER_ID     ?? '';
const AGENT_ID    = process.env.PILOT_AGENT_ID    ?? '';
const PROJECT_ID  = process.env.PILOT_PROJECT_ID  ?? '';
const INTERNAL    = process.env.PILOT_INTERNAL_URL ?? 'http://localhost:3000';
const SPEC_ID     = process.env.PILOT_SPEC_ID     || null;
const SHIFT_ID    = process.env.PILOT_SHIFT_ID    || null;
const PARENT_SID  = process.env.PILOT_PARENT_SESSION_ID || null;

// ---------------------------------------------------------------------------
// HTTP helper — loopback calls to the main server
// ---------------------------------------------------------------------------

function callInternal(
  method: string,
  urlPath: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const base    = new URL(INTERNAL);
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const opts: http.RequestOptions = {
      hostname: base.hostname,
      port:     base.port || (base.protocol === 'https:' ? 443 : 80),
      path:     urlPath,
      method,
      headers: {
        'Content-Type':    'application/json',
        'X-Pilot-Internal': '1',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c: Buffer) => { buf += c.toString(); });
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch { resolve(buf); }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'create_task',
    description: 'Create a new task for the team. Optionally auto-assigns to an idle agent of the requested role.',
    inputSchema: {
      type: 'object',
      properties: {
        title:      { type: 'string',  description: 'Short task title' },
        prompt:     { type: 'string',  description: 'Detailed instructions for the agent' },
        baseBranch: { type: 'string',  description: 'Base branch to work from (default: main)' },
        role:       { type: 'string',  enum: ['worker', 'reviewer', 'planner'], description: 'Agent role for this task' },
        priority:   { type: 'number', description: 'Priority 1–10, higher = more urgent (default: 5)' },
      },
      required: ['title', 'prompt'],
    },
  },
  {
    name: 'get_session_status',
    description: 'Get the current status, journal, and metadata of a session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID (defaults to current session)' },
      },
      required: [],
    },
  },
  {
    name: 'update_journal',
    description: 'Write or update the session journal. Call this to record progress incrementally — it persists across server restarts.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Journal content (replaces any prior journal)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'update_spec',
    description: 'Update the spec document for this planning session. Only available in spec sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full spec content in Markdown' },
      },
      required: ['content'],
    },
  },
  {
    name: 'submit_review',
    description: 'Submit a code review verdict. Only available in review sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        verdict:  { type: 'string', enum: ['approved', 'changes_requested'], description: 'Review outcome' },
        comments: { type: 'array',  items: { type: 'string' }, description: 'Review comments or requested changes' },
      },
      required: ['verdict'],
    },
  },
  {
    name: 'request_clarification',
    description: 'Ask the user a question and wait for their answer before continuing. Use when the task is ambiguous and guessing would be worse than pausing.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
        options:  { type: 'array', items: { type: 'string' }, description: 'Optional list of answer choices to show as buttons' },
      },
      required: ['question'],
    },
  },
  {
    name: 'skip_task',
    description: 'Mark the current task as failed/skipped with a reason. Use when the task is blocked by something outside your control.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you are skipping this task' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'complete_task',
    description: 'Record a completion summary for the current task. The task will be marked done when the session exits.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'What was accomplished' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'append_journal',
    description: 'Append a note to the session journal without replacing prior content. Use this for incremental progress updates — call it often so partial work survives a crash. Use update_journal only for your final summary.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Text to append to the journal' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_task_status',
    description: 'Check the status and journal of a task and its most recent session. Use this to see whether a subtask has completed and what the agent accomplished.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to check' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'list_agents',
    description: 'List all agents on this team with their roles and current availability. Call this before creating tasks so you can make informed role and assignment decisions.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_quota_status',
    description: 'Check the current API quota/rate-limit status for this connection.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'send_to_agent',
    description: 'Queue a follow-up prompt for another session. The target session must be done or in error state.',
    inputSchema: {
      type: 'object',
      properties: {
        targetSessionId: { type: 'string', description: 'ID of the session to send to' },
        message:         { type: 'string', description: 'The prompt to send' },
      },
      required: ['targetSessionId', 'message'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

async function callTool(name: string, args: Record<string, unknown>): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
  const err  = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });

  try {
    switch (name) {

      case 'create_task': {
        const result = await callInternal('POST', '/internal/tasks', {
          sessionId:  SESSION_ID,
          title:      args.title,
          prompt:     args.prompt,
          baseBranch: args.baseBranch ?? 'main',
          role:       args.role ?? 'worker',
          priority:   args.priority ?? 5,
        });
        const r = result as { id?: string; title?: string; error?: string };
        if (r.error) return err(`Failed to create task: ${r.error}`);
        return text(`Task created: "${r.title}" (id: ${r.id})`);
      }

      case 'get_session_status': {
        const sid = (args.sessionId as string) || SESSION_ID;
        const result = await callInternal('GET', `/internal/sessions/${sid}`);
        const r = result as Record<string, unknown>;
        if ((r as any).error) return err(`Session not found: ${sid}`);
        return text(JSON.stringify(r, null, 2));
      }

      case 'update_journal': {
        await callInternal('PATCH', `/internal/sessions/${SESSION_ID}/journal`, {
          content: args.content,
        });
        return text('Journal updated.');
      }

      case 'append_journal': {
        await callInternal('PATCH', `/internal/sessions/${SESSION_ID}/journal/append`, {
          content: args.content,
        });
        return text('Journal updated.');
      }

      case 'get_task_status': {
        const result = await callInternal('GET', `/internal/tasks/${args.taskId as string}`);
        const r = result as { error?: string };
        if (r.error) return err(`Task not found: ${args.taskId}`);
        return text(JSON.stringify(result, null, 2));
      }

      case 'list_agents': {
        const result = await callInternal('GET', `/internal/agents?sessionId=${SESSION_ID}`);
        return text(JSON.stringify(result, null, 2));
      }

      case 'update_spec': {
        if (!SPEC_ID) return err('update_spec is only available in spec sessions.');
        await callInternal('PATCH', `/internal/specs/${SPEC_ID}`, {
          content: args.content,
        });
        return text('Spec updated.');
      }

      case 'submit_review': {
        if (!PARENT_SID) return err('submit_review is only available in review sessions.');
        await callInternal('POST', `/internal/sessions/${SESSION_ID}/review`, {
          verdict:  args.verdict,
          comments: args.comments ?? [],
        });
        return text(`Review submitted: ${args.verdict}`);
      }

      case 'request_clarification': {
        // Long-polls until the user responds (up to 10 minutes)
        const result = await callInternal(
          'POST',
          '/internal/clarifications',
          {
            sessionId: SESSION_ID,
            question:  args.question,
            options:   args.options ?? null,
          },
          11 * 60 * 1000, // 11 min HTTP timeout to outlast 10 min server timeout
        );
        const r = result as { response?: string; error?: string };
        if (r.error) return err(`Clarification failed: ${r.error}`);
        return text(`User answered: ${r.response}`);
      }

      case 'skip_task': {
        await callInternal('POST', `/internal/sessions/${SESSION_ID}/skip-task`, {
          reason: args.reason,
        });
        return text(`Task marked as skipped: ${args.reason}`);
      }

      case 'complete_task': {
        await callInternal('POST', `/internal/sessions/${SESSION_ID}/complete-task`, {
          summary: args.summary,
        });
        return text('Task completion recorded.');
      }

      case 'get_quota_status': {
        const result = await callInternal('GET', `/internal/sessions/${SESSION_ID}/quota`);
        const r = result as { quotaStatus?: string; quotaResetAt?: string };
        if (r.quotaStatus === 'ok') return text('Quota OK — no rate limits active.');
        return text(`Quota status: ${r.quotaStatus}. Resets at: ${r.quotaResetAt ?? 'unknown'}`);
      }

      case 'send_to_agent': {
        const result = await callInternal('POST', `/internal/sessions/${SESSION_ID}/send-to-agent`, {
          targetSessionId: args.targetSessionId,
          message:         args.message,
        });
        const r = result as { turnId?: string; error?: string };
        if (r.error) return err(`Failed to send: ${r.error}`);
        return text(`Message queued as turn ${r.turnId} for session ${args.targetSessionId}`);
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(`Tool error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 stdio loop
// ---------------------------------------------------------------------------

function respond(id: string | number | null, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id: string | number | null, code: number, message: string) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: { jsonrpc: string; id?: string | number; method: string; params?: unknown };
  try { msg = JSON.parse(trimmed); }
  catch { return; }

  const { id, method, params } = msg;
  const isNotification = id === undefined;

  switch (method) {
    case 'initialize':
      respond(id ?? null, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'pilot', version: '1.0.0' },
      });
      break;

    case 'notifications/initialized':
      // notification — no response
      break;

    case 'ping':
      if (!isNotification) respond(id!, {});
      break;

    case 'tools/list':
      respond(id ?? null, { tools: TOOLS });
      break;

    case 'tools/call': {
      const p = params as { name: string; arguments?: Record<string, unknown> };
      if (!p?.name) { respondError(id ?? null, -32602, 'Missing tool name'); break; }
      const result = await callTool(p.name, p.arguments ?? {});
      respond(id ?? null, result);
      break;
    }

    default:
      if (!isNotification) respondError(id ?? null, -32601, `Method not found: ${method}`);
  }
});

rl.on('close', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));
