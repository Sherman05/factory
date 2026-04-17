import { Bot } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

export function createBot(
  token: string,
  ownerChatId: number,
  logger: PingLogger = console
): Bot {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const baseFetchConfig = proxyUrl
    ? ({ agent: new HttpsProxyAgent(proxyUrl) } as Record<string, unknown>)
    : undefined;
  const bot = new Bot(token, baseFetchConfig ? { client: { baseFetchConfig } } : undefined);
  bot.command('ping', (ctx) => handlePing(ctx, ownerChatId, logger));
  return bot;
}
