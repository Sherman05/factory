import { describe, expect, it } from 'vitest';
import { createTaskQueue } from '../src/taskQueue.ts';

function freshQueue() {
  return createTaskQueue(':memory:');
}

describe('createTaskQueue', () => {
  it('enqueue returns a Task in queued state with an id and createdAt', () => {
    const q = freshQueue();
    const before = Date.now();
    const task = q.enqueue('add /version', 42);
    const after = Date.now();

    expect(task.id).toBeGreaterThan(0);
    expect(task.desc).toBe('add /version');
    expect(task.state).toBe('queued');
    expect(task.createdBy).toBe(42);
    expect(task.createdAt).toBeGreaterThanOrEqual(before);
    expect(task.createdAt).toBeLessThanOrEqual(after);
    expect(task.prUrl).toBeUndefined();
    expect(task.error).toBeUndefined();
  });

  it('claim() returns the oldest queued task and marks it running', () => {
    const q = freshQueue();
    const first = q.enqueue('a', 1);
    q.enqueue('b', 1);

    const claimed = q.claim();
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(first.id);
    expect(claimed!.state).toBe('running');

    const active = q.getActive();
    expect(active.find((t) => t.id === first.id)?.state).toBe('running');
  });

  it('claim() returns null when nothing is queued', () => {
    const q = freshQueue();
    expect(q.claim()).toBeNull();
  });

  it('claim() never returns already-running tasks', () => {
    const q = freshQueue();
    q.enqueue('a', 1);
    q.enqueue('b', 1);
    q.claim();

    const second = q.claim();
    expect(second?.desc).toBe('b');

    expect(q.claim()).toBeNull();
  });

  it('update() transitions running → done with prUrl', () => {
    const q = freshQueue();
    const t = q.enqueue('x', 1);
    q.claim();
    q.update(t.id, { state: 'done', prUrl: 'https://example.com/pr/1' });

    const recent = q.getRecent();
    const stored = recent.find((r) => r.id === t.id);
    expect(stored?.state).toBe('done');
    expect(stored?.prUrl).toBe('https://example.com/pr/1');
  });

  it('update() transitions running → failed with error', () => {
    const q = freshQueue();
    const t = q.enqueue('x', 1);
    q.claim();
    q.update(t.id, { state: 'failed', error: 'boom' });

    const recent = q.getRecent();
    const stored = recent.find((r) => r.id === t.id);
    expect(stored?.state).toBe('failed');
    expect(stored?.error).toBe('boom');
  });

  it('update() throws on invalid transition', () => {
    const q = freshQueue();
    const t = q.enqueue('x', 1);
    expect(() => q.update(t.id, { state: 'done' })).toThrow(/queued.*done/);
  });

  it('update() throws when the task does not exist', () => {
    const q = freshQueue();
    expect(() => q.update(999, { state: 'running' })).toThrow(/999/);
  });

  it('getActive() returns only queued and running tasks', () => {
    const q = freshQueue();
    const a = q.enqueue('a', 1);
    const b = q.enqueue('b', 1);
    q.enqueue('c', 1);

    q.claim(); // a → running
    q.update(a.id, { state: 'done', prUrl: 'url' });
    q.claim(); // b → running

    const active = q.getActive();
    const ids = active.map((t) => t.id).sort();
    expect(ids).toEqual([b.id, ids.find((i) => i !== b.id)!].sort());
    expect(active.every((t) => t.state === 'queued' || t.state === 'running')).toBe(true);
    expect(active.some((t) => t.id === a.id)).toBe(false);
  });

  it('getRecent(limit) returns most recent tasks newest first', () => {
    const q = freshQueue();
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(q.enqueue(`t${i}`, 1).id);
    }
    const recent = q.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[0]!.id).toBe(ids[4]);
    expect(recent[2]!.id).toBe(ids[2]);
  });

  it('getById returns the task when it exists', () => {
    const q = freshQueue();
    const t = q.enqueue('foo', 7);
    const fetched = q.getById(t.id);
    expect(fetched?.id).toBe(t.id);
    expect(fetched?.desc).toBe('foo');
  });

  it('getById returns null for an unknown id', () => {
    const q = freshQueue();
    expect(q.getById(404)).toBeNull();
  });

  it('getRecent() defaults to 10', () => {
    const q = freshQueue();
    for (let i = 0; i < 15; i++) q.enqueue(`t${i}`, 1);
    expect(q.getRecent()).toHaveLength(10);
  });

  it('persists across reopens when using a file path', () => {
    const os = require('node:os') as typeof import('node:os');
    const path = require('node:path') as typeof import('node:path');
    const fs = require('node:fs') as typeof import('node:fs');
    const file = path.join(os.tmpdir(), `tq-${Date.now()}-${Math.random()}.db`);
    try {
      const q1 = createTaskQueue(file);
      const t = q1.enqueue('persisted', 7);
      q1.close();

      const q2 = createTaskQueue(file);
      const active = q2.getActive();
      expect(active.find((r) => r.id === t.id)?.desc).toBe('persisted');
      q2.close();
    } finally {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
  });
});
