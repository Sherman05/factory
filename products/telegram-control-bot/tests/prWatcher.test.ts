import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrWatcher } from '../src/prWatcher.ts';
import type { GitHubPR } from '../src/messages.ts';

function pr(overrides: Partial<GitHubPR>): GitHubPR {
  return {
    number: overrides.number ?? 1,
    title: overrides.title ?? 'feat: thing',
    state: overrides.state ?? 'open',
    merged: overrides.merged ?? false,
    html_url: overrides.html_url ?? `https://github.com/Sherman05/factory/pull/${overrides.number ?? 1}`,
    updated_at: overrides.updated_at ?? '2026-04-18T10:00:00Z'
  };
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn() };
}

describe('createPrWatcher', () => {
  it('first tick stays silent and initializes known state', async () => {
    const client = { listPulls: vi.fn().mockResolvedValue([pr({ number: 1 }), pr({ number: 2 })]) };
    const notify = vi.fn().mockResolvedValue(undefined);
    const logger = makeLogger();
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000, logger });

    await watcher.tick();

    expect(notify).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('initialized with 2'));
  });

  it('notifies when a new PR appears on subsequent tick', async () => {
    const client = {
      listPulls: vi
        .fn()
        .mockResolvedValueOnce([pr({ number: 1 })])
        .mockResolvedValueOnce([pr({ number: 1 }), pr({ number: 2, title: 'feat: new' })])
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000 });

    await watcher.tick();
    await watcher.tick();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('🆕 PR #2: feat: new'));
  });

  it('notifies merged transition (open → merged)', async () => {
    const client = {
      listPulls: vi
        .fn()
        .mockResolvedValueOnce([pr({ number: 3, state: 'open', merged: false })])
        .mockResolvedValueOnce([pr({ number: 3, state: 'closed', merged: true })])
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000 });

    await watcher.tick();
    await watcher.tick();

    expect(notify).toHaveBeenCalledWith('✅ PR #3 merged into main');
  });

  it('notifies closed-without-merge transition (open → closed)', async () => {
    const client = {
      listPulls: vi
        .fn()
        .mockResolvedValueOnce([pr({ number: 7, state: 'open', merged: false })])
        .mockResolvedValueOnce([pr({ number: 7, state: 'closed', merged: false })])
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000 });

    await watcher.tick();
    await watcher.tick();

    expect(notify).toHaveBeenCalledWith('❌ PR #7 closed without merge');
  });

  it('does not re-notify when state stays the same', async () => {
    const client = {
      listPulls: vi.fn().mockResolvedValue([pr({ number: 1, state: 'open' })])
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000 });

    await watcher.tick();
    await watcher.tick();
    await watcher.tick();

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify when a brand-new PR appears already merged (rare race)', async () => {
    const client = {
      listPulls: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([pr({ number: 9, state: 'closed', merged: true })])
    };
    const notify = vi.fn().mockResolvedValue(undefined);
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000 });

    await watcher.tick();
    await watcher.tick();

    expect(notify).not.toHaveBeenCalled();
  });

  it('swallows client errors and logs them', async () => {
    const client = {
      listPulls: vi.fn().mockRejectedValue(new Error('boom'))
    };
    const notify = vi.fn();
    const logger = makeLogger();
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000, logger });

    await expect(watcher.tick()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'pr watcher tick failed',
      expect.any(Error)
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('swallows notify errors so the loop keeps running', async () => {
    const client = {
      listPulls: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([pr({ number: 11 })])
    };
    const notify = vi.fn().mockRejectedValue(new Error('tg down'));
    const logger = makeLogger();
    const watcher = createPrWatcher({ client, notify, intervalMs: 1000, logger });

    await watcher.tick();
    await expect(watcher.tick()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'pr watcher notify failed',
      expect.any(Error)
    );
  });

  describe('start / stop', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('runs first tick then schedules on interval; stop clears the interval', async () => {
      const client = { listPulls: vi.fn().mockResolvedValue([]) };
      const notify = vi.fn();
      const watcher = createPrWatcher({ client, notify, intervalMs: 60000 });

      await watcher.start();
      expect(client.listPulls).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60000);
      expect(client.listPulls).toHaveBeenCalledTimes(2);

      watcher.stop();
      await vi.advanceTimersByTimeAsync(60000);
      expect(client.listPulls).toHaveBeenCalledTimes(2);
    });
  });
});
