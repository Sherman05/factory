import type { Task, TaskQueue } from './taskQueue.ts';

export interface StatusCommandLogger {
  log: (message: string) => void;
}

export interface StatusCommandCtx {
  chat?: { id: number };
  reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown>;
}

export interface StatusCommandDeps {
  ownerChatId: number;
  queue: TaskQueue;
  logger: StatusCommandLogger;
}

const RECENT_LIMIT = 5;
const QUERY_LIMIT = 25;

export async function handleStatus(
  ctx: StatusCommandCtx,
  deps: StatusCommandDeps
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId !== deps.ownerChatId) {
    deps.logger.log(`ignored: chat_id=${chatId}`);
    return;
  }

  const active = deps.queue.getActive();
  const recentRaw = deps.queue.getRecent(QUERY_LIMIT);
  const finished = recentRaw
    .filter((t) => t.state === 'done' || t.state === 'failed')
    .slice(0, RECENT_LIMIT);

  if (active.length === 0 && finished.length === 0) {
    await ctx.reply('📭 No tasks yet');
    return;
  }

  const parts: string[] = ['📋 Status'];
  if (active.length > 0) {
    parts.push('');
    parts.push('⏳ Active:');
    for (const t of active) parts.push(formatActive(t));
  }
  if (finished.length > 0) {
    parts.push('');
    parts.push('📜 Recent:');
    for (const t of finished) parts.push(formatFinished(t));
  }

  await ctx.reply(parts.join('\n'), {
    link_preview_options: { is_disabled: true }
  });
}

function formatActive(t: Task): string {
  return `  #${t.id} ${t.state} — ${t.desc}`;
}

function formatFinished(t: Task): string {
  if (t.state === 'done') {
    const url = t.prUrl ?? '(no PR link)';
    return `  ✅ #${t.id} ${t.desc} — ${url}`;
  }
  const err = t.error ?? 'unknown error';
  return `  ❌ #${t.id} ${t.desc} — ${err}`;
}
