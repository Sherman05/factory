import type { GitHubClient } from './githubClient.ts';

export type AnswerCallbackArg =
  | string
  | { text?: string; show_alert?: boolean; url?: string; cache_time?: number };

export interface CallbackCtx {
  callbackQuery?: { data?: string; from: { id: number } };
  answerCallbackQuery(other?: AnswerCallbackArg): Promise<unknown>;
  editMessageText(text: string): Promise<unknown>;
}

export interface HandlerLogger {
  log: (message: string) => void;
  error: (message: string, err?: unknown) => void;
}

export interface HandlerDeps {
  client: GitHubClient;
  ownerChatId: number;
  logger?: HandlerLogger;
  now?: () => Date;
}

const noopLogger: HandlerLogger = {
  log: () => undefined,
  error: () => undefined
};

function hhmm(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

async function rejectIfNotOwner(
  ctx: CallbackCtx,
  ownerChatId: number,
  logger: HandlerLogger
): Promise<boolean> {
  const fromId = ctx.callbackQuery?.from.id;
  if (fromId !== ownerChatId) {
    logger.log(`ignored: callback from chat_id=${fromId}`);
    await ctx.answerCallbackQuery('not authorized');
    return true;
  }
  return false;
}

export async function handleMerge(
  ctx: CallbackCtx,
  prNumber: number,
  deps: HandlerDeps
): Promise<void> {
  const logger = deps.logger ?? noopLogger;
  if (await rejectIfNotOwner(ctx, deps.ownerChatId, logger)) return;

  await ctx.answerCallbackQuery('merging...');
  try {
    const pr = await deps.client.getPr(prNumber);
    await deps.client.mergePr(prNumber);
    try {
      await deps.client.deleteBranch(pr.head_ref);
    } catch (err) {
      logger.error('delete branch failed (non-fatal)', err);
    }
    const now = (deps.now ?? (() => new Date()))();
    await ctx.editMessageText(`✅ PR #${prNumber} merged by you at ${hhmm(now)}`);
  } catch (err) {
    logger.error('merge failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.answerCallbackQuery({
      text: `merge failed: ${truncate(msg, 180)}`,
      show_alert: true
    });
  }
}

export async function handleClose(
  ctx: CallbackCtx,
  prNumber: number,
  deps: HandlerDeps
): Promise<void> {
  const logger = deps.logger ?? noopLogger;
  if (await rejectIfNotOwner(ctx, deps.ownerChatId, logger)) return;

  await ctx.answerCallbackQuery('closing...');
  try {
    await deps.client.closePr(prNumber);
    const now = (deps.now ?? (() => new Date()))();
    await ctx.editMessageText(`❌ PR #${prNumber} closed by you at ${hhmm(now)}`);
  } catch (err) {
    logger.error('close failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.answerCallbackQuery({
      text: `close failed: ${truncate(msg, 180)}`,
      show_alert: true
    });
  }
}
