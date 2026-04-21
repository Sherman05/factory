import { Bot } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { handleNew, type CommitBriefFn, type EnqueueTaskFn } from './newCommandHandler.ts';
import { handleStatus } from './statusCommand.ts';
import { handleClose, handleMerge } from './callbackHandlers.ts';
import type { GitHubClient } from './githubClient.ts';
import type { TaskQueue } from './taskQueue.ts';

export interface PingLogger {
  log: (message: string) => void;
}

export interface PingContext {
  chat?: { id: number };
  reply: (text: string) => Promise<unknown>;
}

export async function handlePing(
  ctx: PingContext,
  ownerChatId: number,
  logger: PingLogger
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId !== ownerChatId) {
    logger.log(`ignored: chat_id=${chatId}`);
    return;
  }
  await ctx.reply('pong');
}

export interface BotDeps {
  token: string;
  ownerChatId: number;
  commitBrief: CommitBriefFn;
  enqueueTask: EnqueueTaskFn;
  taskQueue: TaskQueue;
  repoSlug: string;
  githubClient: GitHubClient;
  now?: () => Date;
  logger?: PingLogger;
}

export function createBot(deps: BotDeps): Bot {
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const baseFetchConfig = proxyUrl
    ? ({ agent: new HttpsProxyAgent(proxyUrl) } as Record<string, unknown>)
    : undefined;
  const bot = new Bot(
    deps.token,
    baseFetchConfig ? { client: { baseFetchConfig } } : undefined
  );

  bot.command('ping', (ctx) => handlePing(ctx, deps.ownerChatId, logger));
  bot.command('new', (ctx) =>
    handleNew(ctx, {
      ownerChatId: deps.ownerChatId,
      commitBrief: deps.commitBrief,
      enqueueTask: deps.enqueueTask,
      now,
      repoSlug: deps.repoSlug,
      logger
    })
  );
  bot.command('status', (ctx) =>
    handleStatus(ctx, {
      ownerChatId: deps.ownerChatId,
      queue: deps.taskQueue,
      logger
    })
  );

  const callbackLogger = {
    log: (m: string) => logger.log(m),
    error: (m: string, err?: unknown) => console.error(m, err)
  };
  bot.callbackQuery(/^merge:(\d+)$/, (ctx) =>
    handleMerge(ctx, Number(ctx.match[1]), {
      client: deps.githubClient,
      ownerChatId: deps.ownerChatId,
      logger: callbackLogger,
      now
    })
  );
  bot.callbackQuery(/^close:(\d+)$/, (ctx) =>
    handleClose(ctx, Number(ctx.match[1]), {
      client: deps.githubClient,
      ownerChatId: deps.ownerChatId,
      logger: callbackLogger,
      now
    })
  );

  return bot;
}
