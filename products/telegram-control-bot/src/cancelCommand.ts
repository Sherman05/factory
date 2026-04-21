import type { TaskQueue } from './taskQueue.ts';

export interface CancelCommandLogger {
  log: (message: string) => void;
}

export interface CancelCommandCtx {
  chat?: { id: number };
  message?: { text?: string };
  reply: (text: string) => Promise<unknown>;
}

export type CancelRunningFn = (taskId: number) => boolean;

export interface CancelCommandDeps {
  ownerChatId: number;
  queue: TaskQueue;
  cancelRunning: CancelRunningFn;
  logger: CancelCommandLogger;
}

const CANCEL_REASON = 'canceled by owner';

export async function handleCancel(
  ctx: CancelCommandCtx,
  deps: CancelCommandDeps
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId !== deps.ownerChatId) {
    deps.logger.log(`ignored: chat_id=${chatId}`);
    return;
  }

  const id = parseId(ctx.message?.text ?? '');
  if (id === null) {
    await ctx.reply('usage: /cancel <id>');
    return;
  }

  if (deps.cancelRunning(id)) {
    await ctx.reply(`🛑 Task #${id} canceled (was running) — killing claude CLI…`);
    return;
  }

  const task = deps.queue.getById(id);
  if (!task) {
    await ctx.reply(`⚠️ no task with id ${id}`);
    return;
  }

  if (task.state === 'queued') {
    deps.queue.update(id, { state: 'failed', error: CANCEL_REASON });
    await ctx.reply(`🛑 Task #${id} canceled (was queued)`);
    return;
  }

  await ctx.reply(
    `ℹ️ Task #${id} is already in state ${task.state}, nothing to cancel`
  );
}

function parseId(raw: string): number | null {
  const match = /^\/cancel(?:@\S+)?(?:\s+(\S+))?/i.exec(raw.trim());
  if (!match || !match[1]) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}
