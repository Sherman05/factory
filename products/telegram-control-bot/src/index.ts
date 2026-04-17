import 'dotenv/config';
import { loadConfig } from './config.ts';
import { createBot } from './bot.ts';
import { createServer } from './server.ts';
import { makeNotifier } from './notifier.ts';

async function main(): Promise<void> {
  const config = loadConfig();

  const bot = createBot(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_OWNER_CHAT_ID);
  const notify = makeNotifier(bot.api, config.TELEGRAM_OWNER_CHAT_ID);
  const server = createServer({ sendNotification: notify, logger: true });

  const shutdown = async (signal: string) => {
    console.log(`received ${signal}, shutting down`);
    await Promise.allSettled([bot.stop(), server.close()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  void bot.start({
    onStart: (me) => console.log(`bot @${me.username} started`)
  });
  const address = await server.listen({ port: config.HTTP_PORT, host: '0.0.0.0' });
  console.log(`http listening on ${address}`);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
