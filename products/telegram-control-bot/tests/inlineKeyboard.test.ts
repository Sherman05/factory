import { describe, expect, it } from 'vitest';
import { buildPrKeyboard, parseCallbackData } from '../src/inlineKeyboard.ts';

describe('buildPrKeyboard', () => {
  it('produces two buttons with the expected callback data', () => {
    const kb = buildPrKeyboard(42);
    const json = kb.inline_keyboard;
    expect(json).toHaveLength(1);
    expect(json[0]).toHaveLength(2);
    expect(json[0]![0]).toMatchObject({ text: '✅ Merge', callback_data: 'merge:42' });
    expect(json[0]![1]).toMatchObject({ text: '❌ Close', callback_data: 'close:42' });
  });
});

describe('parseCallbackData', () => {
  it('parses merge:N', () => {
    expect(parseCallbackData('merge:7')).toEqual({ action: 'merge', prNumber: 7 });
  });
  it('parses close:N', () => {
    expect(parseCallbackData('close:123')).toEqual({ action: 'close', prNumber: 123 });
  });
  it('returns null for junk input', () => {
    expect(parseCallbackData('')).toBeNull();
    expect(parseCallbackData('merge:')).toBeNull();
    expect(parseCallbackData('merge:abc')).toBeNull();
    expect(parseCallbackData('hack:1')).toBeNull();
  });
});
