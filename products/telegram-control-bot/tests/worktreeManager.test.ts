import { describe, expect, it, vi } from 'vitest';
import { createWorktreeManager } from '../src/worktreeManager.ts';

function fakeDeps() {
  const raw = vi.fn().mockResolvedValue('');
  const mkdir = vi.fn().mockResolvedValue(undefined);
  return { git: { raw }, mkdir };
}

describe('createWorktreeManager', () => {
  it('create() builds a worktree at worktrees-root/task-<id> on run/task-<id>', async () => {
    const deps = fakeDeps();
    const mgr = createWorktreeManager(deps, '/factory/.worktrees');

    const info = await mgr.create(42);

    expect(info).toEqual({
      path: '/factory/.worktrees/task-42',
      branch: 'run/task-42'
    });
    expect(deps.mkdir).toHaveBeenCalledWith('/factory/.worktrees', { recursive: true });
    expect(deps.git.raw).toHaveBeenCalledWith([
      'worktree',
      'add',
      '/factory/.worktrees/task-42',
      '-b',
      'run/task-42'
    ]);
  });

  it('remove() invokes git worktree remove --force with the given path', async () => {
    const deps = fakeDeps();
    const mgr = createWorktreeManager(deps, '/factory/.worktrees');

    await mgr.remove('/factory/.worktrees/task-42');

    expect(deps.git.raw).toHaveBeenCalledWith([
      'worktree',
      'remove',
      '/factory/.worktrees/task-42',
      '--force'
    ]);
  });

  it('propagates errors from git raw on create', async () => {
    const deps = fakeDeps();
    deps.git.raw.mockRejectedValueOnce(new Error('branch exists'));
    const mgr = createWorktreeManager(deps, '/factory/.worktrees');

    await expect(mgr.create(1)).rejects.toThrow('branch exists');
  });

  it('propagates errors from git raw on remove', async () => {
    const deps = fakeDeps();
    deps.git.raw.mockRejectedValueOnce(new Error('worktree locked'));
    const mgr = createWorktreeManager(deps, '/factory/.worktrees');

    await expect(mgr.remove('/x')).rejects.toThrow('worktree locked');
  });

  it('create ensures base root exists before calling git', async () => {
    const deps = fakeDeps();
    const order: string[] = [];
    deps.mkdir.mockImplementationOnce(async () => {
      order.push('mkdir');
    });
    deps.git.raw.mockImplementationOnce(async () => {
      order.push('git');
      return '';
    });
    const mgr = createWorktreeManager(deps, '/r');

    await mgr.create(7);

    expect(order).toEqual(['mkdir', 'git']);
  });
});
