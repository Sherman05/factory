import { describe, expect, it, vi } from 'vitest';
import { InlineKeyboard } from 'grammy';
import { makeNotifier, makeTextNotifier } from '../src/notifier.ts';

function fakeApi() {
  const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
  return { sendMessage };
}

describe('makeNotifier', () => {
  it('sends a message to the owner chat id with the title and url', async () => {
    const api = fakeApi();
    const notify = makeNotifier(api, 42);

    await notify('PR #1 ready', 'https://github.com/Sherman05/factory/pull/1');

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, opts] = api.sendMessage.mock.calls[0]!;
    expect(chatId).toBe(42);
    expect(text).toContain('PR #1 ready');
    expect(text).toContain('https://github.com/Sherman05/factory/pull/1');
    expect(opts).toMatchObject({ parse_mode: 'HTML' });
  });

  it('escapes HTML special characters in the title to prevent injection', async () => {
    const api = fakeApi();
    const notify = makeNotifier(api, 42);

    await notify('<script>alert(1)</script> & "friends"', 'https://example.com');

    const [, text] = api.sendMessage.mock.calls[0]!;
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;');
    expect(text).toContain('&amp;');
    expect(text).toContain('&quot;');
  });

  it('propagates errors from the Telegram API', async () => {
    const api = {
      sendMessage: vi.fn().mockRejectedValue(new Error('telegram down'))
    };
    const notify = makeNotifier(api, 42);

    await expect(notify('t', 'https://example.com')).rejects.toThrow('telegram down');
  });
});

describe('makeTextNotifier', () => {
  it('sends a plain-text message to the owner chat id', async () => {
    const api = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
    const notify = makeTextNotifier(api, 7);

    await notify('✅ PR #5 merged into main');

    expect(api.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, opts] = api.sendMessage.mock.calls[0]!;
    expect(chatId).toBe(7);
    expect(text).toBe('✅ PR #5 merged into main');
    expect(opts).toMatchObject({ disable_web_page_preview: false });
    expect(opts).not.toHaveProperty('parse_mode');
  });

  it('propagates errors from the Telegram API', async () => {
    const api = {
      sendMessage: vi.fn().mockRejectedValue(new Error('telegram down'))
    };
    const notify = makeTextNotifier(api, 7);

    await expect(notify('hi')).rejects.toThrow('telegram down');
  });

  it('forwards reply_markup when opts.replyMarkup is provided', async () => {
    const api = { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) };
    const notify = makeTextNotifier(api, 7);
    const keyboard = new InlineKeyboard().text('x', 'y');

    await notify('hi', { replyMarkup: keyboard });

    const [, , opts] = api.sendMessage.mock.calls[0]!;
    expect(opts).toMatchObject({ reply_markup: keyboard });
  });
});
