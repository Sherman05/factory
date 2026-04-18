import 'dotenv/config';
import simpleGit from 'simple-git';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { loadConfig } from './config.ts';
import { createBot } from './bot.ts';
import { createServer } from './server.ts';
import { makeNotifier, makeTextNotifier } from './notifier.ts';
import { writeBriefAndCommit } from './gitWriter.ts';
import { makeGitHubClient } from './githubClient.ts';
import { createPrWatcher } from './prWatcher.ts';

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`outbound http routed via proxy ${proxyUrl}`);
}

async function main(): Promise<void> {
  const config = loadConfig();

  const git = simpleGit(config.FACTORY_REPO_ROOT);
  const commitBrief = (file: Parameters<typeof writeBriefAndCommit>[1], message: string) =>
    writeBriefAndCommit({ git, repoRoot: config.FACTORY_REPO_ROOT }, file, message);

  const bot = createBot({
    token: config.TELEGRAM_BOT_TOKEN,
    ownerChatId: config.TELEGRAM_OWNER_CHAT_ID,
    commitBrief,
    repoSlug: config.GITHUB_REPO_SLUG
  });
  const notify = makeNotifier(bot.api, config.TELEGRAM_OWNER_CHAT_ID);
  const notifyText = makeTextNotifier(bot.api, config.TELEGRAM_OWNER_CHAT_ID);
  const server = createServer({ sendNotification: notify, logger: true });

  const githubClient = makeGitHubClient({
    token: config.GITHUB_TOKEN,
    repoSlug: config.GITHUB_REPO_SLUG
  });
  const prWatcher = createPrWatcher({
    client: githubClient,
    notify: notifyText,
    intervalMs: config.POLL_INTERVAL_MS
  });

  const shutdown = async (signal: string) => {
    console.log(`received ${signal}, shutting down`);
    prWatcher.stop();
    await Promise.allSettled([bot.stop(), server.close()]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  bot.start({
    onStart: (me) => console.log(`bot @${me.username} started`)
  }).catch((err) => console.error('bot start failed:', err));
  const address = await server.listen({ port: config.HTTP_PORT, host: '0.0.0.0' });
  console.log(`http listening on ${address}`);
  prWatcher.start().catch((err) => console.error('pr watcher start failed:', err));
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
