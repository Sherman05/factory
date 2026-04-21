export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface WorktreeManagerDeps {
  git: {
    raw(args: string[]): Promise<string>;
  };
  mkdir(path: string, opts?: { recursive: boolean }): Promise<void>;
}

export interface WorktreeManager {
  create(taskId: number): Promise<WorktreeInfo>;
  remove(path: string): Promise<void>;
}

export function createWorktreeManager(
  deps: WorktreeManagerDeps,
  worktreesRoot: string
): WorktreeManager {
  return {
    async create(taskId) {
      const path = `${worktreesRoot}/task-${taskId}`;
      const branch = `run/task-${taskId}`;
      await deps.mkdir(worktreesRoot, { recursive: true });
      await deps.git.raw(['worktree', 'add', path, '-b', branch]);
      return { path, branch };
    },
    async remove(path) {
      await deps.git.raw(['worktree', 'remove', path, '--force']);
    }
  };
}
