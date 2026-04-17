import { describe, expect, it, vi } from 'vitest';
import { handleNew } from '../src/newCommandHandler.ts';
import type { BriefFile, GitWriterResult } from '../src/gitWriter.ts';

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

const FROZEN_NOW = new Date('2026-04-17T19:30:00Z');
const OWNER = 42;
const REPO_SLUG = 'Sherman05/factory';

describe('handleNew', () => {
  it('ignores messages from a non-owner chat and logs the chat id', async () => {
    const { ctx } = fakeCtx({ chatId: 999, text: '/new hello' });
    const logger = fakeLogger();
    const commit = okCommit();

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger
    });

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('ignored: chat_id=999');
  });

  it('does not crash when chat is undefined', async () => {
    const { ctx } = fakeCtx({ chatId: undefined, text: '/new hi' });
    const logger = fakeLogger();

    await expect(
      handleNew(ctx, {
        ownerChatId: OWNER,
        commitBrief: okCommit(),
        now: () => FROZEN_NOW,
        repoSlug: REPO_SLUG,
        logger
      })
    ).resolves.not.toThrow();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('replies with usage when the description is empty', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/new' });
    const commit = okCommit();

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

    expect(ctx.reply).toHaveBeenCalledWith('usage: /new <description>');
    expect(commit).not.toHaveBeenCalled();
  });

  it('replies with usage when the description is only whitespace', async () => {
    const { ctx } = fakeCtx({ chatId: OWNER, text: '/new    ' });
    const commit = okCommit();

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

    expect(ctx.reply).toHaveBeenCalledWith('usage: /new <description>');
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits a brief file whose name includes slug and UTC timestamp', async () => {
    const { ctx } = fakeCtx({
      chatId: OWNER,
      text: '/new Сделай мне Wordle-клон на React'
    });
    const commit = okCommit('abc1234');

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

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

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

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

  it('replies with the path, short sha and GitHub URL on success', async () => {
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/new Hello world' });
    const commit = okCommit('abc1234');

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

    expect(replies).toHaveLength(1);
    const reply = replies[0]!;
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

  it('replies with a git error message when commit throws, without crashing', async () => {
    const { ctx, replies } = fakeCtx({ chatId: OWNER, text: '/new anything' });
    const commit = vi.fn(async () => {
      throw new Error('push rejected: non-fast-forward');
    });

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]!.text).toBe('⚠️ git error: push rejected: non-fast-forward');
  });

  it('strips @botusername suffix from the command', async () => {
    const { ctx } = fakeCtx({
      chatId: OWNER,
      text: '/new@factorybot Build something cool'
    });
    const commit = okCommit();

    await handleNew(ctx, {
      ownerChatId: OWNER,
      commitBrief: commit,
      now: () => FROZEN_NOW,
      repoSlug: REPO_SLUG,
      logger: fakeLogger()
    });

    const briefFile = (commit as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![0] as BriefFile;
    expect(briefFile.relativePath).toContain('auto-build-something-cool-');
  });
});
