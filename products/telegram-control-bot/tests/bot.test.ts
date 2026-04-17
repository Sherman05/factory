import { describe, expect, it, vi } from 'vitest';
import { handlePing } from '../src/bot.ts';

function fakeCtx(chatId: number | undefined) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    chat: chatId === undefined ? undefined : { id: chatId },
    reply
  };
  return { ctx, reply };
}

function fakeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('handlePing', () => {
  it('replies "pong" when the chat id matches the owner', async () => {
    const { ctx, reply } = fakeCtx(42);
    const logger = fakeLogger();

    await handlePing(ctx, 42, logger);

    expect(reply).toHaveBeenCalledWith('pong');
  });

  it('does not reply when the chat id is not whitelisted', async () => {
    const { ctx, reply } = fakeCtx(999);
    const logger = fakeLogger();

    await handlePing(ctx, 42, logger);

    expect(reply).not.toHaveBeenCalled();
  });

  it('logs "ignored: chat_id=X" for a non-whitelisted chat', async () => {
    const { ctx } = fakeCtx(999);
    const logger = fakeLogger();

    await handlePing(ctx, 42, logger);

    expect(logger.log).toHaveBeenCalledWith('ignored: chat_id=999');
  });

  it('does not crash when chat is undefined', async () => {
    const { ctx, reply } = fakeCtx(undefined);
    const logger = fakeLogger();

    await expect(handlePing(ctx, 42, logger)).resolves.not.toThrow();
    expect(reply).not.toHaveBeenCalled();
  });
});
