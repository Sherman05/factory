import { Bot } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { handleNew, type CommitBriefFn } from './newCommandHandler.ts';

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
  repoSlug: string;
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
      now,
      repoSlug: deps.repoSlug,
      logger
    })
  );

  return bot;
}
