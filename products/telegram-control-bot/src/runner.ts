import { buildOrchestrationPrompt } from './orchestrationPrompt.ts';
import type { WorktreeManager } from './worktreeManager.ts';

export type RunnerEvent =
  | { type: 'state'; state: 'starting' | 'running' | 'completed' | 'failed' }
  | { type: 'stdout'; line: string }
  | { type: 'stderr'; line: string }
  | { type: 'pr_opened'; url: string }
  | { type: 'task_failed'; reason: string };

export interface Task {
  id: number;
  description: string;
  abortSignal?: AbortSignal;
}

export interface ChildProcessLike {
  stdout: { on(ev: 'data', cb: (chunk: unknown) => void): void };
  stderr: { on(ev: 'data', cb: (chunk: unknown) => void): void };
  on(ev: 'exit', cb: (code: number | null) => void): unknown;
  on(ev: 'error', cb: (err: Error) => void): unknown;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface SpawnLike {
  (cmd: string, args: string[], opts: { cwd: string }): ChildProcessLike;
}

export interface RunnerDeps {
  worktreeManager: WorktreeManager;
  spawn: SpawnLike;
  repoSlug: string;
  claudeCliPath?: string;
}

export interface Runner {
  runTask(task: Task): AsyncIterable<RunnerEvent>;
}

export function createRunner(deps: RunnerDeps): Runner {
  const cliPath = deps.claudeCliPath ?? 'claude';

  return {
    runTask(task) {
      return runTaskGen(deps, cliPath, task);
    }
  };
}

async function* runTaskGen(
  deps: RunnerDeps,
  cliPath: string,
  task: Task
): AsyncGenerator<RunnerEvent> {
  yield { type: 'state', state: 'starting' };

  if (task.abortSignal?.aborted) {
    yield { type: 'stderr', line: 'canceled before start' };
    yield { type: 'state', state: 'failed' };
    return;
  }

  let worktree;
  try {
    worktree = await deps.worktreeManager.create(task.id);
  } catch (err) {
    yield { type: 'stderr', line: errMessage(err) };
    yield { type: 'state', state: 'failed' };
    return;
  }

  const prompt = buildOrchestrationPrompt({
    taskId: task.id,
    description: task.description,
    branchName: worktree.branch,
    repoSlug: deps.repoSlug
  });

  const child = deps.spawn(cliPath, ['-p', prompt], { cwd: worktree.path });
  const abortListener = () => child.kill('SIGTERM');
  task.abortSignal?.addEventListener('abort', abortListener, { once: true });

  const queue: RunnerEvent[] = [];
  let waiter: (() => void) | null = null;
  let taskFailedReason: string | null = null;
  let exitCode: number | null | undefined;
  let settled = false;

  const push = (ev: RunnerEvent) => {
    queue.push(ev);
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };

  const settle = () => {
    settled = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };

  let stdoutBuf = '';
  child.stdout.on('data', (chunk: unknown) => {
    stdoutBuf += String(chunk);
    stdoutBuf = consumeLines(stdoutBuf, (line) => {
      push({ type: 'stdout', line });
      const prMatch = /^PR_URL:\s*(\S+)/.exec(line);
      if (prMatch) push({ type: 'pr_opened', url: prMatch[1]! });
      const failMatch = /^TASK_FAILED:\s*(.+)$/.exec(line);
      if (failMatch) {
        taskFailedReason = failMatch[1]!.trim();
        push({ type: 'task_failed', reason: taskFailedReason });
      }
    });
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk: unknown) => {
    stderrBuf += String(chunk);
    stderrBuf = consumeLines(stderrBuf, (line) => {
      push({ type: 'stderr', line });
    });
  });

  child.on('exit', (code) => {
    exitCode = code;
    settle();
  });

  child.on('error', (err) => {
    push({ type: 'stderr', line: errMessage(err) });
    settle();
  });

  yield { type: 'state', state: 'running' };

  while (!settled || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    await new Promise<void>((resolve) => {
      waiter = resolve;
    });
  }

  if (stdoutBuf) yield { type: 'stdout', line: stdoutBuf };
  if (stderrBuf) yield { type: 'stderr', line: stderrBuf };

  const success = exitCode === 0 && taskFailedReason === null;
  if (success) {
    try {
      await deps.worktreeManager.remove(worktree.path);
    } catch (err) {
      yield { type: 'stderr', line: `worktree cleanup failed: ${errMessage(err)}` };
    }
    yield { type: 'state', state: 'completed' };
  } else {
    yield { type: 'state', state: 'failed' };
  }
}

function consumeLines(buf: string, onLine: (line: string) => void): string {
  let idx: number;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).replace(/\r$/, '');
    buf = buf.slice(idx + 1);
    onLine(line);
  }
  return buf;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
