import { describe, expect, it, vi } from 'vitest';
import { handleNew } from '../src/newCommandHandler.ts';
import type { BriefFile, GitWriterResult } from '../src/gitWriter.ts';
import type { Task } from '../src/taskQueue.ts';

interface FakeReplyCall {
  text: string;
  opts?: Record<string, unknown>;
}

function fakeCtx(opts: { chatId?: number; text?: string }) {
  const replies: FakeReplyCall[] = [];
  const ctx = {
    chat: opts.chatId === undefined ? undefined : { id: opts.chatId },
    message: opts.text === undefined ? undefined : { text: opts.text },
    reply: vi.fn(
      async (text: string, replyOpts?: Record<string, unknown>) => {
        replies.push({ text, opts: replyOpts });
      }
    )
  };
  return { ctx, replies };
}

function fakeLogger() {
  return { log: vi.fn() };
}

function okCommit(sha = 'abc1234'): (
  file: BriefFile,
  message: string
) => Promise<GitWriterResult> {
  return vi.fn(async (file) => ({ relativePath: file.relativePath, shortSha: sha }));
}

function okEnqueue(id = 7) {
  return vi.fn((desc: string, createdBy: number): Task => ({
    id,
    desc,
    state: 'queued',
    createdBy,
    createdAt: 1
  }));
}

const FROZEN_NOW = new Date('2026-04-17T19:30:00Z');
const OWNER = 42;
const REPO_SLUG = 'Sherman05/factory';

interface DepsOverride {
  commitBrief?: ReturnType<typeof okCommit>;
  enqueueTask?: ReturnType<typeof okEnqueue>;
  logger?: ReturnType<typeof fakeLogger>;
}

function deps(overrides: DepsOverride = {}) {
  return {
    ownerChatId: OWNER,
    commitBrief: overrides.commitBrief ?? okCommit(),
    enqueueTask: overrides.enqueueTask ?? okEnqueue(),
    now: () => FROZEN_NOW,
    repoSlug: REPO_SLUG,
    logger: overrides.logger ?? fakeLogger()
  };
}

describe('handleNew', () => {
  it('ignores messages from a non-owner chat and logs the chat id', async () => {
    const { ctx } = fakeCtx({ chatId: 999, text: '/new hello' });
    const logger = fakeLogger();
    const commit = okCommit();
    const enqueue = okEnqueue();

    await handleNew(ctx, deps({ commitBrief: commit, enqueueTask: enqueue, logger }));

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('ignored: chat_id=999');
  });

  it('does not crash when chat is undefined', async () => {
    const { ctx } = fakeCtx({ chatId: undefined, text: '/new hi' });

    await expect(handleNew(ctx, deps())).resolves.not.toThrow();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('replies with usage when the description is empty', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/new' });
    const commit = okCommit();
    const enqueue = okEnqueue();

    await handleNew(ctx, deps({ commitBrief: commit, enqueueTask: enqueue }));

    expect(ctx.reply).toHaveBeenCalledWith('usage: /new <description>');
    expect(commit).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('replies with usage when the description is only whitespace', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/new    ' });
    const commit = okCommit();
    const enqueue = okEnqueue();

    await handleNew(ctx, deps({ commitBrief: commit, enqueueTask: enqueue }));

    expect(ctx.reply).toHaveBeenCalledWith('usage: /new <description>');
    expect(commit).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the task with description and owner chat id', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/new Build dark mode' });
    const enqueue = okEnqueue(17);

    await handleNew(ctx, deps({ enqueueTask: enqueue }));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('Build dark mode', OWNER);
  });

  it('commits a brief file whose name includes slug and UTC timestamp', async () => {
    const { ctx } = fakeCtx({
      chatId: OWNER,
      text: '/new Сделай мне Wordle-клон на React'
    });
    const commit = okCommit('abc1234');

    await handleNew(ctx, deps({ commitBrief: commit }));

    expect(commit).toHaveBeenCalledTimes(1);
    const call = (commit as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const briefFile = call[0] as BriefFile;
    const msg = call[1] as string;
    expect(briefFile.relativePath).toBe(
      'docs/briefs/auto-sdelai-mne-wordle-klon-na-react-2026-04-17-1930.md'
    );
    expect(msg).toBe(
      'feat(brief): add auto-generated brief sdelai-mne-wordle-klon-na-react'
    );
  });

  it('writes a brief body that contains the template sections and the description', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/new Build a todo list' });
    const commit = okCommit();

    await handleNew(ctx, deps({ commitBrief: commit }));

    const briefFile = (commit as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![0] as BriefFile;
    expect(briefFile.content).toContain('Build a todo list');
    expect(briefFile.content).toContain('# Auto-brief');
    expect(briefFile.content).toContain('## Description (from Telegram)');
    expect(briefFile.content).toContain('## Acceptance criteria');
    expect(briefFile.content).toContain('## Technical stack');
    expect(briefFile.content).toContain('## Out of scope');
    expect(briefFile.content).toContain('**Created:** 2026-04-17T19:30:00.000Z');
  });

  it('replies with task id, brief path, short sha and GitHub URL on success', async () => {
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/new Hello world' });
    const commit = okCommit('abc1234');
    const enqueue = okEnqueue(17);

    await handleNew(ctx, deps({ commitBrief: commit, enqueueTask: enqueue }));

    expect(replies).toHaveLength(1);
    const reply = replies[0]!;
    expect(reply.text).toContain('🆕 Task #17');
    expect(reply.text).toContain('Hello world');
    expect(reply.text).toContain('docs/briefs/auto-hello-world-2026-04-17-1930.md');
    expect(reply.text).toContain('abc1234');
    expect(reply.text).toContain(
      'https://github.com/Sherman05/factory/blob/main/docs/briefs/auto-hello-world-2026-04-17-1930.md'
    );
    const linkOpts = reply.opts?.link_preview_options as
      | { is_disabled?: boolean }
      | undefined;
    expect(linkOpts?.is_disabled).toBe(true);
  });

  it('still reports the task id when brief commit throws', async () => {
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/new anything' });
    const commit = vi.fn(async () => {
      throw new Error('push rejected: non-fast-forward');
    });
    const enqueue = okEnqueue(9);

    await handleNew(ctx, deps({ commitBrief: commit, enqueueTask: enqueue }));

    expect(enqueue).toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0]!.text).toContain('🆕 Task #9 queued');
    expect(replies[0]!.text).toContain('push rejected: non-fast-forward');
  });

  it('reports a queue error when enqueue throws (no brief committed)', async () => {
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/new anything' });
    const commit = okCommit();
    const enqueue = vi.fn(() => {
      throw new Error('db locked');
    });

    await handleNew(ctx, deps({ commitBrief: commit, enqueueTask: enqueue }));

    expect(commit).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0]!.text).toContain('⚠️ queue error');
    expect(replies[0]!.text).toContain('db locked');
  });

  it('strips @botusername suffix from the command', async () => {
    const { ctx } = fakeCtx({
      chatId: OWNER,
      text: '/new@factorybot Build something cool'
    });
    const commit = okCommit();

    await handleNew(ctx, deps({ commitBrief: commit }));

    const briefFile = (commit as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![0] as BriefFile;
    expect(briefFile.relativePath).toContain('auto-build-something-cool-');
  });
});
