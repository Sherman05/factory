export interface TelegramSendMessageApi {
  sendMessage(
    chatId: number,
    text: string,
    opts?: { parse_mode?: 'HTML' | 'MarkdownV2'; disable_web_page_preview?: boolean }
  ): Promise<unknown>;
}

export type Notifier = (title: string, url: string) => Promise<void>;
export type TextNotifier = (text: string) => Promise<void>;

export function makeNotifier(api: TelegramSendMessageApi, ownerChatId: number): Notifier {
  return async (title, url) => {
    const safeTitle = escapeHtml(title);
    const safeUrl = escapeHtml(url);
    const text = `<b>${safeTitle}</b>\n<a href="${safeUrl}">${safeUrl}</a>`;
    await api.sendMessage(ownerChatId, text, { parse_mode: 'HTML' });
  };
}

export function makeTextNotifier(
  api: TelegramSendMessageApi,
  ownerChatId: number
): TextNotifier {
  return async (text) => {
    await api.sendMessage(ownerChatId, text, { disable_web_page_preview: false });
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
