import { describe, expect, it, vi } from 'vitest';
import { handleCancel } from '../src/cancelCommand.ts';
import type { Task, TaskQueue } from '../src/taskQueue.ts';

interface FakeReplyCall {
  text: string;
}

function fakeCtx(opts: { chatId?: number; text?: string }) {
  const replies: FakeReplyCall[] = [];
  const ctx = {
    chat: opts.chatId === undefined ? undefined : { id: opts.chatId },
    message: opts.text === undefined ? undefined : { text: opts.text },
    reply: vi.fn(async (text: string) => {
      replies.push({ text });
    })
  };
  return { ctx, replies };
}

function fakeLogger() {
  return { log: vi.fn() };
}

function fakeQueue(tasks: Record<number, Task | null>): TaskQueue {
  const update = vi.fn(
    (id: number, patch: { state?: string; error?: string }) => {
      const t = tasks[id];
      if (!t) throw new Error(`no task ${id}`);
      if (patch.state) t.state = patch.state as Task['state'];
      if (patch.error) t.error = patch.error;
    }
  );
  return {
    enqueue: vi.fn(),
    claim: vi.fn(),
    update,
    getById: vi.fn((id: number) => tasks[id] ?? null),
    getActive: vi.fn(() => []),
    getRecent: vi.fn(() => []),
    close: vi.fn()
  } as unknown as TaskQueue;
}

const OWNER = 42;

function T(id: number, state: Task['state']): Task {
  return { id, desc: `task-${id}`, state, createdBy: OWNER, createdAt: id };
}

describe('handleCancel', () => {
  it('ignores non-owner chats and logs', async () => {
    const { ctx } = fakeCtx({ chatId: 999, text: '/cancel 7' });
    const logger = fakeLogger();
    const queue = fakeQueue({});
    const cancel = vi.fn();

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: cancel,
      logger
    });

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('ignored: chat_id=999');
  });

  it('replies with usage when no id is given', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/cancel' });
    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({}),
      cancelRunning: vi.fn(),
      logger: fakeLogger()
    });
    expect(ctx.reply).toHaveBeenCalledWith('usage: /cancel <id>');
  });

  it('replies with usage when the id is not a positive integer', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/cancel abc' });
    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({}),
      cancelRunning: vi.fn(),
      logger: fakeLogger()
    });
    expect(ctx.reply).toHaveBeenCalledWith('usage: /cancel <id>');
  });

  it('cancels a running task by delegating to the worker', async () => {
    const task = T(7, 'running');
    const queue = fakeQueue({ 7: task });
    const cancel = vi.fn(() => true);
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/cancel 7' });

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: cancel,
      logger: fakeLogger()
    });

    expect(cancel).toHaveBeenCalledWith(7);
    expect(replies[0]!.text).toContain('🛑 Task #7 canceled (was running)');
  });

  it('cancels a queued task by updating the queue to failed', async () => {
    const task = T(3, 'queued');
    const queue = fakeQueue({ 3: task });
    const cancel = vi.fn(() => false);
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/cancel 3' });

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: cancel,
      logger: fakeLogger()
    });

    expect(cancel).toHaveBeenCalledWith(3);
    expect(queue.update).toHaveBeenCalledWith(3, {
      state: 'failed',
      error: 'canceled by owner'
    });
    expect(replies[0]!.text).toBe('🛑 Task #3 canceled (was queued)');
  });

  it('reports no-op when the task is already done', async () => {
    const task = T(5, 'done');
    task.prUrl = 'https://gh.com/pr/5';
    const queue = fakeQueue({ 5: task });
    const cancel = vi.fn(() => false);
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/cancel 5' });

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: cancel,
      logger: fakeLogger()
    });

    expect(queue.update).not.toHaveBeenCalled();
    expect(replies[0]!.text).toBe('ℹ️ Task #5 is already in state done, nothing to cancel');
  });

  it('reports no-op when the task is already failed', async () => {
    const task = T(9, 'failed');
    const queue = fakeQueue({ 9: task });
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/cancel 9' });

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: () => false,
      logger: fakeLogger()
    });

    expect(replies[0]!.text).toBe(
      'ℹ️ Task #9 is already in state failed, nothing to cancel'
    );
  });

  it('replies not found when the id does not exist in the queue', async () => {
    const queue = fakeQueue({});
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/cancel 404' });

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: () => false,
      logger: fakeLogger()
    });

    expect(replies[0]!.text).toBe('⚠️ no task with id 404');
  });

  it('strips @botusername suffix from the command', async () => {
    const task = T(1, 'queued');
    const queue = fakeQueue({ 1: task });
    const { ctx, replies } = fakeCtx({
      chatId: OWNER,
      text: '/cancel@factorybot 1'
    });

    await handleCancel(ctx, {
      ownerChatId: OWNER,
      queue,
      cancelRunning: () => false,
      logger: fakeLogger()
    });

    expect(replies[0]!.text).toBe('🛑 Task #1 canceled (was queued)');
  });
});
