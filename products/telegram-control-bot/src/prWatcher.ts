import type { InlineKeyboard } from 'grammy';
import type { GitHubClient } from './githubClient.ts';
import type { TextNotifier } from './notifier.ts';
import { buildPrKeyboard } from './inlineKeyboard.ts';
import { prMessages, type GitHubPR } from './messages.ts';

type PullsLister = Pick<GitHubClient, 'listPulls'>;

type PrState = 'open' | 'merged' | 'closed';

export interface PrWatcherLogger {
  log: (message: string) => void;
  error: (message: string, err?: unknown) => void;
}

export interface PrWatcherDeps {
  client: PullsLister;
  notify: TextNotifier;
  intervalMs: number;
  logger?: PrWatcherLogger;
}

export interface PrWatcher {
  start: () => Promise<void>;
  stop: () => void;
  tick: () => Promise<void>;
}

function stateOf(pr: GitHubPR): PrState {
  if (pr.merged) return 'merged';
  if (pr.state === 'closed') return 'closed';
  return 'open';
}

export function createPrWatcher(deps: PrWatcherDeps): PrWatcher {
  const logger: PrWatcherLogger = deps.logger ?? {
    log: (m) => console.log(m),
    error: (m, e) => console.error(m, e)
  };
  const known = new Map<number, PrState>();
  let initialized = false;
  let timer: NodeJS.Timeout | null = null;

  const safeNotify = async (
    text: string,
    opts?: { replyMarkup?: InlineKeyboard }
  ): Promise<void> => {
    try {
      await deps.notify(text, opts);
    } catch (err) {
      logger.error('pr watcher notify failed', err);
    }
  };

  const tick = async (): Promise<void> => {
    let prs: GitHubPR[];
    try {
      prs = await deps.client.listPulls();
    } catch (err) {
      logger.error('pr watcher tick failed', err);
      return;
    }
    if (!initialized) {
      for (const pr of prs) known.set(pr.number, stateOf(pr));
      initialized = true;
      logger.log(`pr watcher initialized with ${prs.length} PRs`);
      return;
    }
    for (const pr of prs) {
      const current = stateOf(pr);
      const previous = known.get(pr.number);
      if (previous === undefined) {
        known.set(pr.number, current);
        if (current === 'open') {
          await safeNotify(prMessages.opened(pr), {
            replyMarkup: buildPrKeyboard(pr.number)
          });
        }
        continue;
      }
      if (previous === current) continue;
      if (previous === 'open' && current === 'merged') {
        await safeNotify(prMessages.merged(pr));
      } else if (previous === 'open' && current === 'closed') {
        await safeNotify(prMessages.closed(pr));
      }
      known.set(pr.number, current);
    }
  };

  const start = async (): Promise<void> => {
    logger.log(`pr watcher started, polling every ${Math.round(deps.intervalMs / 1000)}s`);
    await tick();
    timer = setInterval(() => {
      void tick();
    }, deps.intervalMs);
  };

  const stop = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { start, stop, tick };
}
