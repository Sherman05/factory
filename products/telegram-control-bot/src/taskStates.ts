export type TaskState = 'queued' | 'running' | 'done' | 'failed';

const allowed: ReadonlyMap<TaskState, ReadonlySet<TaskState>> = new Map([
  ['queued', new Set<TaskState>(['running'])],
  ['running', new Set<TaskState>(['done', 'failed'])],
  ['done', new Set<TaskState>()],
  ['failed', new Set<TaskState>()]
]);

export function validTransition(from: TaskState, to: TaskState): boolean {
  return allowed.get(from)?.has(to) ?? false;
}
