import { describe, expect, it, vi } from 'vitest';
import { handleClose, handleMerge } from '../src/callbackHandlers.ts';
import { GitHubApiError } from '../src/githubClient.ts';
import type { GitHubPR } from '../src/messages.ts';

const ownerChatId = 42;

function makeCtx(fromId: number) {
  return {
    callbackQuery: { data: `merge:1`, from: { id: fromId } },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined)
  };
}

function makeClient() {
  return {
    listPulls: vi.fn(),
    getPr: vi.fn<(n: number) => Promise<GitHubPR>>(),
    mergePr: vi.fn<(n: number) => Promise<void>>(),
    closePr: vi.fn<(n: number) => Promise<void>>(),
    deleteBranch: vi.fn<(ref: string) => Promise<void>>()
  };
}

function makeLogger() {
  return { log: vi.fn(), error: vi.fn() };
}

const samplePr: GitHubPR = {
  number: 5,
  title: 'feat: x',
  state: 'open',
  merged: false,
  html_url: 'https://github.com/Sherman05/factory/pull/5',
  updated_at: '2026-04-18T10:00:00Z',
  head_ref: 'feat/x'
};

describe('handleMerge', () => {
  const now = () => new Date('2026-04-18T19:42:00');

  it('merges, deletes branch, and edits message on success', async () => {
    const ctx = makeCtx(ownerChatId);
    const client = makeClient();
    client.getPr.mockResolvedValue(samplePr);
    client.mergePr.mockResolvedValue(undefined);
    client.deleteBranch.mockResolvedValue(undefined);

    await handleMerge(ctx, 5, { client, ownerChatId, now });

    expect(ctx.answerCallbackQuery).toHaveBeenNthCalledWith(1, 'merging...');
    expect(client.mergePr).toHaveBeenCalledWith(5);
    expect(client.deleteBranch).toHaveBeenCalledWith('feat/x');
    expect(ctx.editMessageText).toHaveBeenCalledWith('✅ PR #5 merged by you at 19:42');
  });

  it('still reports success even if branch delete fails', async () => {
    const ctx = makeCtx(ownerChatId);
    const client = makeClient();
    client.getPr.mockResolvedValue(samplePr);
    client.mergePr.mockResolvedValue(undefined);
    client.deleteBranch.mockRejectedValue(new GitHubApiError(422, 'gone'));
    const logger = makeLogger();

    await handleMerge(ctx, 5, { client, ownerChatId, logger, now });

    expect(ctx.editMessageText).toHaveBeenCalledWith('✅ PR #5 merged by you at 19:42');
    expect(logger.error).toHaveBeenCalledWith(
      'delete branch failed (non-fatal)',
      expect.any(GitHubApiError)
    );
  });

  it('shows alert and does not edit message when merge fails (405)', async () => {
    const ctx = makeCtx(ownerChatId);
    const client = makeClient();
    client.getPr.mockResolvedValue(samplePr);
    client.mergePr.mockRejectedValue(new GitHubApiError(405, 'Pull Request is not mergeable'));

    await handleMerge(ctx, 5, { client, ownerChatId, now });

    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(ctx.answerCallbackQuery).toHaveBeenCalledTimes(2);
    const [arg] = ctx.answerCallbackQuery.mock.calls[1]!;
    expect(arg).toMatchObject({
      show_alert: true,
      text: expect.stringMatching(/^merge failed: /)
    });
  });

  it('ignores and answers "not authorized" when callback comes from a different user', async () => {
    const ctx = makeCtx(999);
    const client = makeClient();
    const logger = makeLogger();

    await handleMerge(ctx, 5, { client, ownerChatId, logger, now });

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('not authorized');
    expect(client.mergePr).not.toHaveBeenCalled();
    expect(client.getPr).not.toHaveBeenCalled();
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('ignored: callback from chat_id=999');
  });
});

describe('handleClose', () => {
  const now = () => new Date('2026-04-18T20:15:00');

  it('closes PR and edits message on success', async () => {
    const ctx = makeCtx(ownerChatId);
    const client = makeClient();
    client.closePr.mockResolvedValue(undefined);

    await handleClose(ctx, 9, { client, ownerChatId, now });

    expect(ctx.answerCallbackQuery).toHaveBeenNthCalledWith(1, 'closing...');
    expect(client.closePr).toHaveBeenCalledWith(9);
    expect(ctx.editMessageText).toHaveBeenCalledWith('❌ PR #9 closed by you at 20:15');
  });

  it('shows alert on network error and keeps message intact', async () => {
    const ctx = makeCtx(ownerChatId);
    const client = makeClient();
    client.closePr.mockRejectedValue(new Error('network unreachable'));

    await handleClose(ctx, 9, { client, ownerChatId, now });

    expect(ctx.editMessageText).not.toHaveBeenCalled();
    const [arg] = ctx.answerCallbackQuery.mock.calls[1]!;
    expect(arg).toMatchObject({
      show_alert: true,
      text: expect.stringContaining('close failed: network unreachable')
    });
  });

  it('rejects non-owner callbacks', async () => {
    const ctx = makeCtx(123);
    const client = makeClient();

    await handleClose(ctx, 9, { client, ownerChatId });

    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith('not authorized');
    expect(client.closePr).not.toHaveBeenCalled();
  });
});
