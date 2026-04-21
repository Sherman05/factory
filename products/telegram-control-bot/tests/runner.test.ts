import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createRunner } from '../src/runner.ts';
import type { RunnerEvent } from '../src/runner.ts';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function makeDeps(overrides: Partial<Parameters<typeof createRunner>[0]> = {}) {
  const child = new FakeChild();
  const worktreeManager = {
    create: vi.fn().mockResolvedValue({ path: '/w/task-1', branch: 'run/task-1' }),
    remove: vi.fn().mockResolvedValue(undefined)
  };
  const spawn = vi.fn().mockReturnValue(child);
  return {
    deps: {
      worktreeManager,
      spawn,
      repoSlug: 'Sherman05/factory',
      claudeCliPath: 'claude',
      ...overrides
    },
    child,
    worktreeManager,
    spawn
  };
}

async function drain(iter: AsyncIterable<RunnerEvent>): Promise<RunnerEvent[]> {
  const out: RunnerEvent[] = [];
  for await (const ev of iter) out.push(ev);
  return out;
}

describe('createRunner', () => {
  it('emits state transitions starting → running → completed and yields PR url on success', async () => {
    const { deps, child, spawn, worktreeManager } = makeDeps();
    const runner = createRunner(deps);
    const iter = runner.runTask({ id: 1, description: 'add /version' });

    // kick off consumer, then drive the child
    const drained = drain(iter);

    await flush();
    child.stdout.emit('data', Buffer.from('working...\n'));
    child.stdout.emit('data', Buffer.from('PR_URL: https://github.com/Sherman05/factory/pull/42\n'));
    child.emit('exit', 0);

    const events = await drained;

    expect(events[0]).toEqual({ type: 'state', state: 'starting' });
    expect(events.find((e) => e.type === 'state' && e.state === 'running')).toBeDefined();
    expect(events.find((e) => e.type === 'pr_opened')).toEqual({
      type: 'pr_opened',
      url: 'https://github.com/Sherman05/factory/pull/42'
    });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'completed' });

    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawn.mock.calls[0]!;
    expect(cmd).toBe('claude');
    expect(args[0]).toBe('-p');
    expect(String(args[1])).toContain('add /version');
    expect(opts).toEqual({ cwd: '/w/task-1' });

    expect(worktreeManager.create).toHaveBeenCalledWith(1);
    expect(worktreeManager.remove).toHaveBeenCalledWith('/w/task-1');
  });

  it('emits state=failed and preserves worktree when exit code is non-zero', async () => {
    const { deps, child, worktreeManager } = makeDeps();
    const runner = createRunner(deps);

    const drained = drain(runner.runTask({ id: 1, description: 'x' }));

    await flush();
    child.stderr.emit('data', Buffer.from('boom\n'));
    child.emit('exit', 1);

    const events = await drained;
    expect(events.at(-1)).toEqual({ type: 'state', state: 'failed' });
    expect(events.find((e) => e.type === 'stderr')).toEqual({ type: 'stderr', line: 'boom' });
    expect(worktreeManager.remove).not.toHaveBeenCalled();
  });

  it('emits task_failed with the reason when agent prints TASK_FAILED sentinel', async () => {
    const { deps, child, worktreeManager } = makeDeps();
    const runner = createRunner(deps);

    const drained = drain(runner.runTask({ id: 1, description: 'x' }));

    await flush();
    child.stdout.emit('data', Buffer.from('TASK_FAILED: spec ambiguous\n'));
    child.emit('exit', 0);

    const events = await drained;
    expect(events.find((e) => e.type === 'task_failed')).toEqual({
      type: 'task_failed',
      reason: 'spec ambiguous'
    });
    expect(events.at(-1)).toEqual({ type: 'state', state: 'failed' });
    expect(worktreeManager.remove).not.toHaveBeenCalled();
  });

  it('emits state=failed when child errors before exit', async () => {
    const { deps, child, worktreeManager } = makeDeps();
    const runner = createRunner(deps);

    const drained = drain(runner.runTask({ id: 1, description: 'x' }));

    await flush();
    child.emit('error', new Error('ENOENT claude'));

    const events = await drained;
    expect(events.at(-1)).toEqual({ type: 'state', state: 'failed' });
    expect(events.some((e) => e.type === 'stderr' && /ENOENT claude/.test(e.line))).toBe(true);
    expect(worktreeManager.remove).not.toHaveBeenCalled();
  });

  it('splits multi-line stdout into separate stdout events', async () => {
    const { deps, child } = makeDeps();
    const runner = createRunner(deps);

    const drained = drain(runner.runTask({ id: 1, description: 'x' }));

    await flush();
    child.stdout.emit('data', Buffer.from('line-1\nline-2\n'));
    child.emit('exit', 0);

    const events = await drained;
    const stdoutLines = events.filter((e) => e.type === 'stdout').map((e) => (e as { line: string }).line);
    expect(stdoutLines).toContain('line-1');
    expect(stdoutLines).toContain('line-2');
  });

  it('uses custom claudeCliPath when provided', async () => {
    const { deps, child, spawn } = makeDeps({ claudeCliPath: 'C:/custom/claude.exe' });
    const runner = createRunner(deps);

    const drained = drain(runner.runTask({ id: 1, description: 'x' }));
    await flush();
    child.emit('exit', 0);
    await drained;

    expect(spawn.mock.calls[0]![0]).toBe('C:/custom/claude.exe');
  });

  it('fails gracefully when worktree create rejects', async () => {
    const { deps, worktreeManager } = makeDeps();
    worktreeManager.create.mockRejectedValueOnce(new Error('worktree already exists'));
    const runner = createRunner(deps);

    const events = await drain(runner.runTask({ id: 1, description: 'x' }));
    expect(events.at(-1)).toEqual({ type: 'state', state: 'failed' });
    expect(events.some((e) => e.type === 'stderr' && /worktree already exists/.test(e.line))).toBe(true);
  });

  it('kills the child process with SIGTERM when abortSignal fires mid-run', async () => {
    const { deps, child, spawn } = makeDeps();
    const runner = createRunner(deps);
    const controller = new AbortController();

    const drained = drain(
      runner.runTask({ id: 1, description: 'x', abortSignal: controller.signal })
    );

    await flush();
    expect(spawn).toHaveBeenCalledTimes(1);

    controller.abort();
    await flush();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');

    child.emit('exit', null);
    const events = await drained;
    expect(events.at(-1)).toEqual({ type: 'state', state: 'failed' });
  });

  it('does not spawn the child when abortSignal is already aborted', async () => {
    const { deps, spawn } = makeDeps();
    const runner = createRunner(deps);
    const controller = new AbortController();
    controller.abort();

    const events = await drain(
      runner.runTask({ id: 1, description: 'x', abortSignal: controller.signal })
    );

    expect(spawn).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({ type: 'state', state: 'failed' });
  });
});
