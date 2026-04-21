import type { Runner, RunnerEvent } from './runner.ts';
import type { Task, TaskQueue } from './taskQueue.ts';

export interface TaskWorkerLogger {
  log: (message: string) => void;
  error: (message: string, err?: unknown) => void;
}

export type WorkerNotify = (text: string) => Promise<void>;

export interface TaskWorkerDeps {
  queue: TaskQueue;
  runner: Runner;
  notify: WorkerNotify;
  logger: TaskWorkerLogger;
  tickIntervalMs: number;
  worktreesRoot: string;
  maxParallel?: number;
}

export interface TaskWorker {
  start(): void;
  stop(timeoutMs?: number): Promise<void>;
  cancel(taskId: number): boolean;
}

export function createTaskWorker(deps: TaskWorkerDeps): TaskWorker {
  const maxParallel = Math.max(1, deps.maxParallel ?? 1);
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const active = new Set<Promise<void>>();
  const controllers = new Map<number, AbortController>();

  const safeNotify = async (text: string) => {
    try {
      await deps.notify(text);
    } catch (err) {
      deps.logger.error('notify failed', err);
    }
  };

  const tick = () => {
    while (!stopped && active.size < maxParallel) {
      let task: Task | null;
      try {
        task = deps.queue.claim();
      } catch (err) {
        deps.logger.error('queue.claim failed', err);
        return;
      }
      if (!task) return;
      const controller = new AbortController();
      controllers.set(task.id, controller);
      const promise = runOne(task, controller).finally(() => {
        active.delete(promise);
        controllers.delete(task.id);
      });
      active.add(promise);
    }
  };

  const runOne = async (task: Task, controller: AbortController): Promise<void> => {
    let prUrl: string | undefined;
    let failReason: string | undefined;

    await safeNotify(`⏳ Task #${task.id} starting: ${task.desc}`);

    try {
      for await (const ev of deps.runner.runTask({
        id: task.id,
        description: task.desc,
        abortSignal: controller.signal
      })) {
        handleEvent(ev);
      }
    } catch (err) {
      failReason = err instanceof Error ? err.message : String(err);
    }

    if (controller.signal.aborted) {
      failReason = 'canceled by owner';
      prUrl = undefined;
    }

    function handleEvent(ev: RunnerEvent): void {
      if (ev.type === 'pr_opened') {
        prUrl = ev.url;
      } else if (ev.type === 'task_failed') {
        failReason = ev.reason;
      }
    }

    if (failReason !== undefined) {
      await finalizeFailed(task, failReason);
      return;
    }
    if (prUrl === undefined) {
      await finalizeFailed(task, 'runner exited without PR url or TASK_FAILED');
      return;
    }
    await finalizeDone(task, prUrl);
  };

  const finalizeDone = async (task: Task, prUrl: string) => {
    try {
      deps.queue.update(task.id, { state: 'done', prUrl });
    } catch (err) {
      deps.logger.error(`queue.update(${task.id}) failed`, err);
    }
    await safeNotify(`✅ Task #${task.id} done — ${prUrl}`);
  };

  const finalizeFailed = async (task: Task, reason: string) => {
    try {
      deps.queue.update(task.id, { state: 'failed', error: reason });
    } catch (err) {
      deps.logger.error(`queue.update(${task.id}) failed`, err);
    }
    const wt = `${deps.worktreesRoot}/task-${task.id}`;
    await safeNotify(
      `❌ Task #${task.id} failed — ${reason}\n(worktree preserved at ${wt})`
    );
  };

  return {
    start() {
      if (timer) return;
      stopped = false;
      timer = setInterval(tick, deps.tickIntervalMs);
      tick();
    },
    async stop(timeoutMs = 30000) {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (active.size === 0) return;
      const waitAll = Promise.allSettled(active).then(() => undefined);
      if (timeoutMs <= 0) return;
      await Promise.race([
        waitAll,
        new Promise<void>((r) => setTimeout(r, timeoutMs))
      ]);
    },
    cancel(taskId) {
      const controller = controllers.get(taskId);
      if (!controller) return false;
      controller.abort();
      return true;
    }
  };
}
