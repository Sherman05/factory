import { InlineKeyboard } from 'grammy';

export type CallbackAction = 'merge' | 'close';

export interface ParsedCallback {
  action: CallbackAction;
  prNumber: number;
}

export function buildPrKeyboard(prNumber: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Merge', `merge:${prNumber}`)
    .text('❌ Close', `close:${prNumber}`);
}

export function parseCallbackData(data: string): ParsedCallback | null {
  const match = /^(merge|close):(\d+)$/.exec(data);
  if (!match) return null;
  return { action: match[1] as CallbackAction, prNumber: Number(match[2]) };
}
