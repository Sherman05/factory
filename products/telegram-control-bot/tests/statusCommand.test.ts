import { describe, expect, it, vi } from 'vitest';
import { handleStatus } from '../src/statusCommand.ts';
import type { Task, TaskQueue } from '../src/taskQueue.ts';

interface FakeReplyCall {
  text: string;
  opts?: Record<string, unknown>;
}

function fakeCtx(chatId: number | undefined) {
  const replies: FakeReplyCall[] = [];
  const ctx = {
    chat: chatId === undefined ? undefined : { id: chatId },
    reply: vi.fn(async (text: string, opts?: Record<string, unknown>) => {
      replies.push({ text, opts });
    })
  };
  return { ctx, replies };
}

function fakeLogger() {
  return { log: vi.fn() };
}

function fakeQueue(opts: { active?: Task[]; recent?: Task[] }): TaskQueue {
  return {
    enqueue: vi.fn(),
    claim: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
    getActive: vi.fn(() => opts.active ?? []),
    getRecent: vi.fn(() => opts.recent ?? []),
    close: vi.fn()
  } as unknown as TaskQueue;
}

const OWNER = 42;

describe('handleStatus', () => {
  it('ignores a non-owner chat and logs', async () => {
    const { ctx } = fakeCtx(999);
    const logger = fakeLogger();
    const queue = fakeQueue({});

    await handleStatus(ctx, { ownerChatId: OWNER, queue, logger });

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('ignored: chat_id=999');
  });

  it('does not crash when chat is undefined', async () => {
    const { ctx } = fakeCtx(undefined);
    await expect(
      handleStatus(ctx, {
        ownerChatId: OWNER,
        queue: fakeQueue({}),
        logger: fakeLogger()
      })
    ).resolves.not.toThrow();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('replies "No tasks yet" when queue is empty', async () => {
    const { ctx, replies } = fakeCtx(OWNER);
    await handleStatus(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({ active: [], recent: [] }),
      logger: fakeLogger()
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]!.text).toBe('📭 No tasks yet');
  });

  it('lists active (queued + running) tasks with state label', async () => {
    const active: Task[] = [
      {
        id: 3,
        desc: 'Build wordle',
        state: 'running',
        createdBy: OWNER,
        createdAt: 1
      },
      { id: 4, desc: 'Add /version', state: 'queued', createdBy: OWNER, createdAt: 2 }
    ];
    const { ctx, replies } = fakeCtx(OWNER);

    await handleStatus(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({ active, recent: [] }),
      logger: fakeLogger()
    });

    const reply = replies[0]!.text;
    expect(reply).toContain('⏳ Active:');
    expect(reply).toContain('#3 running — Build wordle');
    expect(reply).toContain('#4 queued — Add /version');
  });

  it('lists up to 5 most-recent done/failed with outcome marker', async () => {
    const recent: Task[] = [];
    for (let i = 0; i < 6; i++) {
      recent.push({
        id: 100 - i,
        desc: `task ${100 - i}`,
        state: i % 2 === 0 ? 'done' : 'failed',
        createdBy: OWNER,
        createdAt: 100 - i,
        prUrl: i % 2 === 0 ? `https://github.com/pr/${100 - i}` : undefined,
        error: i % 2 === 0 ? undefined : 'boom'
      });
    }
    const { ctx, replies } = fakeCtx(OWNER);

    await handleStatus(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({ active: [], recent }),
      logger: fakeLogger()
    });

    const text = replies[0]!.text;
    expect(text).toContain('📜 Recent:');
    expect(text).toContain('✅ #100');
    expect(text).toContain('https://github.com/pr/100');
    expect(text).toContain('❌ #99 task 99 — boom');
    expect((text.match(/^  [✅❌]/gm) ?? []).length).toBe(5);
  });

  it('skips recent items that are still queued/running (they appear in Active)', async () => {
    const recent: Task[] = [
      { id: 5, desc: 'q', state: 'queued', createdBy: OWNER, createdAt: 5 },
      { id: 4, desc: 'r', state: 'running', createdBy: OWNER, createdAt: 4 },
      {
        id: 3,
        desc: 'd',
        state: 'done',
        createdBy: OWNER,
        createdAt: 3,
        prUrl: 'u'
      }
    ];
    const active: Task[] = [recent[0]!, recent[1]!];
    const { ctx, replies } = fakeCtx(OWNER);

    await handleStatus(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({ active, recent }),
      logger: fakeLogger()
    });

    const text = replies[0]!.text;
    expect(text).toContain('#5 queued — q');
    expect(text).toContain('#4 running — r');
    expect(text).toContain('✅ #3 d');
    expect((text.match(/📜 Recent:/g) ?? []).length).toBe(1);
  });

  it('requests getRecent with a limit large enough to cover 5 done/failed after filtering', async () => {
    const queue = fakeQueue({ active: [], recent: [] });
    const { ctx } = fakeCtx(OWNER);

    await handleStatus(ctx, { ownerChatId: OWNER, queue, logger: fakeLogger() });

    const call = (queue.getRecent as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBeGreaterThanOrEqual(10);
  });

  it('disables link previews on the reply', async () => {
    const { ctx, replies } = fakeCtx(OWNER);
    await handleStatus(ctx, {
      ownerChatId: OWNER,
      queue: fakeQueue({
        recent: [
          {
            id: 1,
            desc: 'x',
            state: 'done',
            createdBy: OWNER,
            createdAt: 1,
            prUrl: 'https://example.com/pr/1'
          }
        ]
      }),
      logger: fakeLogger()
    });
    const linkOpts = replies[0]!.opts?.link_preview_options as
      | { is_disabled?: boolean }
      | undefined;
    expect(linkOpts?.is_disabled).toBe(true);
  });
});
