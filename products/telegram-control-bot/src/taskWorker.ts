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
}

export interface TaskWorker {
  start(): void;
  stop(timeoutMs?: number): Promise<void>;
}

export function createTaskWorker(deps: TaskWorkerDeps): TaskWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let active: Promise<void> | null = null;

  const safeNotify = async (text: string) => {
    try {
      await deps.notify(text);
    } catch (err) {
      deps.logger.error('notify failed', err);
    }
  };

  const tick = async () => {
    if (stopped || active) return;
    let task: Task | null;
    try {
      task = deps.queue.claim();
    } catch (err) {
      deps.logger.error('queue.claim failed', err);
      return;
    }
    if (!task) return;
    active = runOne(task).finally(() => {
      active = null;
    });
  };

  const runOne = async (task: Task): Promise<void> => {
    let prUrl: string | undefined;
    let failReason: string | undefined;

    await safeNotify(`⏳ Task #${task.id} starting: ${task.desc}`);

    try {
      for await (const ev of deps.runner.runTask({
        id: task.id,
        description: task.desc
      })) {
        handleEvent(ev);
      }
    } catch (err) {
      failReason = err instanceof Error ? err.message : String(err);
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
      timer = setInterval(() => {
        void tick();
      }, deps.tickIntervalMs);
      void tick();
    },
    async stop(timeoutMs = 30000) {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!active) return;
      const waiter = active;
      if (timeoutMs <= 0) return;
      await Promise.race([
        waiter,
        new Promise<void>((r) => setTimeout(r, timeoutMs))
      ]);
    }
  };
}
