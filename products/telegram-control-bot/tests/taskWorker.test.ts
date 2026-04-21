import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskWorker, type TaskWorkerDeps } from '../src/taskWorker.ts';
import type { Task, TaskQueue, UpdatePatch } from '../src/taskQueue.ts';
import type { Runner, RunnerEvent } from '../src/runner.ts';

type Notification = { text: string };

function makeNotifier() {
  const notifications: Notification[] = [];
  const notify = vi.fn(async (text: string) => {
    notifications.push({ text });
  });
  return { notify, notifications };
}

function makeFakeQueue(initialTasks: Task[]) {
  const tasks = initialTasks.map((t) => ({ ...t }));
  const queue = {
    enqueue: vi.fn(),
    claim: vi.fn(() => {
      const next = tasks.find((t) => t.state === 'queued');
      if (!next) return null;
      next.state = 'running';
      return { ...next };
    }),
    update: vi.fn((id: number, patch: UpdatePatch) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) throw new Error(`no task ${id}`);
      if (patch.state) t.state = patch.state;
      if (patch.prUrl !== undefined) t.prUrl = patch.prUrl;
      if (patch.error !== undefined) t.error = patch.error;
    }),
    getActive: vi.fn(() =>
      tasks.filter((t) => t.state === 'queued' || t.state === 'running')
    ),
    getRecent: vi.fn((limit = 10) => tasks.slice().reverse().slice(0, limit)),
    close: vi.fn()
  } as unknown as TaskQueue;
  return { queue, tasks };
}

function makeRunner(scripts: Record<number, RunnerEvent[]>): Runner {
  return {
    runTask(task) {
      const events = scripts[task.id] ?? [];
      return (async function* () {
        for (const e of events) {
          await Promise.resolve();
          yield e;
        }
      })();
    }
  };
}

function baseDeps(
  overrides: Partial<TaskWorkerDeps> = {}
): TaskWorkerDeps {
  const { notify } = makeNotifier();
  const { queue } = makeFakeQueue([]);
  return {
    queue,
    runner: makeRunner({}),
    notify,
    logger: { log: vi.fn(), error: vi.fn() },
    tickIntervalMs: 10,
    worktreesRoot: '/w',
    maxParallel: 1,
    ...overrides
  };
}

const T = (id: number, state: Task['state'] = 'queued'): Task => ({
  id,
  desc: `task-${id}`,
  state,
  createdBy: 42,
  createdAt: id
});

async function flush(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe('createTaskWorker', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims a queued task, runs it, marks done on completed, emits PR url', async () => {
    const { queue, tasks } = makeFakeQueue([T(1)]);
    const runner = makeRunner({
      1: [
        { type: 'state', state: 'starting' },
        { type: 'state', state: 'running' },
        { type: 'pr_opened', url: 'https://gh.com/pr/1' },
        { type: 'state', state: 'completed' }
      ]
    });
    const { notify, notifications } = makeNotifier();

    const worker = createTaskWorker(
      baseDeps({ queue, runner, notify, tickIntervalMs: 5 })
    );
    worker.start();
    await flush(80);
    await worker.stop();

    expect(tasks[0]!.state).toBe('done');
    expect(tasks[0]!.prUrl).toBe('https://gh.com/pr/1');

    const texts = notifications.map((n) => n.text);
    expect(texts.some((t) => t.includes('⏳ Task #1 starting'))).toBe(true);
    expect(texts.some((t) => t.includes('✅ Task #1 done'))).toBe(true);
    expect(texts.some((t) => t.includes('https://gh.com/pr/1'))).toBe(true);
  });

  it('marks task failed and mentions worktree path on failure', async () => {
    const { queue, tasks } = makeFakeQueue([T(7)]);
    const runner = makeRunner({
      7: [
        { type: 'state', state: 'starting' },
        { type: 'task_failed', reason: 'tests red' },
        { type: 'state', state: 'failed' }
      ]
    });
    const { notify, notifications } = makeNotifier();

    const worker = createTaskWorker(
      baseDeps({
        queue,
        runner,
        notify,
        worktreesRoot: '/tmp/wt',
        tickIntervalMs: 5
      })
    );
    worker.start();
    await flush(80);
    await worker.stop();

    expect(tasks[0]!.state).toBe('failed');
    expect(tasks[0]!.error).toBe('tests red');
    const failNote = notifications
      .map((n) => n.text)
      .find((t) => t.includes('❌ Task #7 failed'));
    expect(failNote).toBeDefined();
    expect(failNote!).toContain('tests red');
    expect(failNote!).toContain('/tmp/wt/task-7');
  });

  it('marks task failed with "exit code" error when no task_failed was emitted', async () => {
    const { queue, tasks } = makeFakeQueue([T(2)]);
    const runner = makeRunner({
      2: [
        { type: 'state', state: 'starting' },
        { type: 'state', state: 'failed' }
      ]
    });

    const worker = createTaskWorker(baseDeps({ queue, runner, tickIntervalMs: 5 }));
    worker.start();
    await flush(80);
    await worker.stop();

    expect(tasks[0]!.state).toBe('failed');
    expect(tasks[0]!.error).toMatch(/claude CLI|runner/i);
  });

  it('processes tasks serially — next tick does not start while previous runs', async () => {
    const { queue, tasks } = makeFakeQueue([T(1), T(2)]);
    let firstRunning = false;
    const runner: Runner = {
      runTask(task) {
        return (async function* () {
          if (task.id === 1) {
            firstRunning = true;
            yield { type: 'state', state: 'starting' } as RunnerEvent;
            await new Promise((r) => setTimeout(r, 30));
            firstRunning = false;
            yield { type: 'pr_opened', url: 'https://gh.com/pr/1' } as RunnerEvent;
            yield { type: 'state', state: 'completed' } as RunnerEvent;
          } else {
            expect(firstRunning).toBe(false);
            yield { type: 'state', state: 'starting' } as RunnerEvent;
            yield { type: 'pr_opened', url: 'https://gh.com/pr/2' } as RunnerEvent;
            yield { type: 'state', state: 'completed' } as RunnerEvent;
          }
        })();
      }
    };

    const worker = createTaskWorker(
      baseDeps({ queue, runner, tickIntervalMs: 5 })
    );
    worker.start();
    await flush(120);
    await worker.stop();

    expect(tasks.every((t) => t.state === 'done')).toBe(true);
  });

  it('stop() waits for the currently running task to finish', async () => {
    const { queue, tasks } = makeFakeQueue([T(1)]);
    const runner: Runner = {
      runTask(_task) {
        return (async function* () {
          yield { type: 'state', state: 'starting' } as RunnerEvent;
          await new Promise((r) => setTimeout(r, 40));
          yield { type: 'pr_opened', url: 'https://gh.com/pr/1' } as RunnerEvent;
          yield { type: 'state', state: 'completed' } as RunnerEvent;
        })();
      }
    };

    const worker = createTaskWorker(
      baseDeps({ queue, runner, tickIntervalMs: 5 })
    );
    worker.start();
    await flush(15);
    await worker.stop(1000);

    expect(tasks[0]!.state).toBe('done');
  });

  it('stop(timeoutMs=0) returns without waiting when nothing runs', async () => {
    const worker = createTaskWorker(baseDeps({ tickIntervalMs: 5 }));
    worker.start();
    await worker.stop(0);
  });

  it('does not crash when claim returns null — just idles', async () => {
    const { queue } = makeFakeQueue([]);
    const worker = createTaskWorker(baseDeps({ queue, tickIntervalMs: 5 }));
    worker.start();
    await flush(30);
    await worker.stop();
    expect(queue.claim).toHaveBeenCalled();
  });

  it('swallows notify errors but keeps processing', async () => {
    const { queue, tasks } = makeFakeQueue([T(1)]);
    const runner = makeRunner({
      1: [
        { type: 'state', state: 'starting' },
        { type: 'pr_opened', url: 'https://gh.com/pr/1' },
        { type: 'state', state: 'completed' }
      ]
    });
    const errorLog = vi.fn();
    const notify = vi.fn(async () => {
      throw new Error('tg down');
    });

    const worker = createTaskWorker(
      baseDeps({
        queue,
        runner,
        notify,
        logger: { log: vi.fn(), error: errorLog },
        tickIntervalMs: 5
      })
    );
    worker.start();
    await flush(80);
    await worker.stop();

    expect(tasks[0]!.state).toBe('done');
    expect(errorLog).toHaveBeenCalled();
  });

  it('swallows runner errors and marks task failed', async () => {
    const { queue, tasks } = makeFakeQueue([T(3)]);
    const runner: Runner = {
      runTask() {
        return (async function* () {
          yield { type: 'state', state: 'starting' } as RunnerEvent;
          throw new Error('spawn EACCES');
        })();
      }
    };

    const worker = createTaskWorker(
      baseDeps({ queue, runner, tickIntervalMs: 5 })
    );
    worker.start();
    await flush(80);
    await worker.stop();

    expect(tasks[0]!.state).toBe('failed');
    expect(tasks[0]!.error).toContain('spawn EACCES');
  });

  it('does not start a new tick after stop()', async () => {
    const { queue } = makeFakeQueue([T(1), T(2)]);
    const runner = makeRunner({
      1: [
        { type: 'state', state: 'starting' },
        { type: 'pr_opened', url: 'https://gh.com/pr/1' },
        { type: 'state', state: 'completed' }
      ]
    });
    const worker = createTaskWorker(
      baseDeps({ queue, runner, tickIntervalMs: 5 })
    );
    worker.start();
    await flush(30);
    await worker.stop();
    const callsAfterStop = (queue.claim as ReturnType<typeof vi.fn>).mock.calls.length;
    await flush(30);
    expect((queue.claim as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      callsAfterStop
    );
  });

  describe('parallelism (maxParallel > 1)', () => {
    it('runs up to maxParallel tasks concurrently', async () => {
      const { queue, tasks } = makeFakeQueue([T(1), T(2), T(3), T(4)]);
      let inflight = 0;
      let maxObserved = 0;
      const runner: Runner = {
        runTask(task) {
          return (async function* () {
            inflight++;
            maxObserved = Math.max(maxObserved, inflight);
            yield { type: 'state', state: 'starting' } as RunnerEvent;
            await new Promise((r) => setTimeout(r, 40));
            yield {
              type: 'pr_opened',
              url: `https://gh.com/pr/${task.id}`
            } as RunnerEvent;
            yield { type: 'state', state: 'completed' } as RunnerEvent;
            inflight--;
          })();
        }
      };

      const worker = createTaskWorker(
        baseDeps({ queue, runner, tickIntervalMs: 5, maxParallel: 3 })
      );
      worker.start();
      await flush(200);
      await worker.stop();

      expect(maxObserved).toBeGreaterThanOrEqual(3);
      expect(tasks.every((t) => t.state === 'done')).toBe(true);
    });

    it('never exceeds maxParallel concurrent runs', async () => {
      const { queue, tasks } = makeFakeQueue([T(1), T(2), T(3), T(4), T(5)]);
      let inflight = 0;
      let maxObserved = 0;
      const runner: Runner = {
        runTask(task) {
          return (async function* () {
            inflight++;
            maxObserved = Math.max(maxObserved, inflight);
            yield { type: 'state', state: 'starting' } as RunnerEvent;
            await new Promise((r) => setTimeout(r, 20));
            yield {
              type: 'pr_opened',
              url: `https://gh.com/pr/${task.id}`
            } as RunnerEvent;
            yield { type: 'state', state: 'completed' } as RunnerEvent;
            inflight--;
          })();
        }
      };

      const worker = createTaskWorker(
        baseDeps({ queue, runner, tickIntervalMs: 3, maxParallel: 2 })
      );
      worker.start();
      await flush(200);
      await worker.stop();

      expect(maxObserved).toBe(2);
      expect(tasks.every((t) => t.state === 'done')).toBe(true);
    });

    it('starts a new task within one tick after a slot frees up', async () => {
      const { queue, tasks } = makeFakeQueue([T(1), T(2), T(3)]);
      const durations: Record<number, number> = { 1: 20, 2: 50, 3: 50 };
      const runner: Runner = {
        runTask(task) {
          return (async function* () {
            yield { type: 'state', state: 'starting' } as RunnerEvent;
            await new Promise((r) => setTimeout(r, durations[task.id]));
            yield {
              type: 'pr_opened',
              url: `https://gh.com/pr/${task.id}`
            } as RunnerEvent;
            yield { type: 'state', state: 'completed' } as RunnerEvent;
          })();
        }
      };

      const worker = createTaskWorker(
        baseDeps({ queue, runner, tickIntervalMs: 3, maxParallel: 2 })
      );
      worker.start();
      await flush(150);
      await worker.stop();

      expect(tasks.every((t) => t.state === 'done')).toBe(true);
    });

    it('stop() waits for all parallel tasks to finish', async () => {
      const { queue, tasks } = makeFakeQueue([T(1), T(2), T(3)]);
      const runner: Runner = {
        runTask(task) {
          return (async function* () {
            yield { type: 'state', state: 'starting' } as RunnerEvent;
            await new Promise((r) => setTimeout(r, 30));
            yield {
              type: 'pr_opened',
              url: `https://gh.com/pr/${task.id}`
            } as RunnerEvent;
            yield { type: 'state', state: 'completed' } as RunnerEvent;
          })();
        }
      };

      const worker = createTaskWorker(
        baseDeps({ queue, runner, tickIntervalMs: 3, maxParallel: 3 })
      );
      worker.start();
      await flush(10);
      await worker.stop(5000);

      expect(tasks.every((t) => t.state === 'done')).toBe(true);
    });
  });
});
