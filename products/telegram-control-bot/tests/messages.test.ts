import { describe, expect, it } from 'vitest';
import { prMessages, type GitHubPR } from '../src/messages.ts';

const pr: GitHubPR = {
  number: 42,
  title: 'feat: add Wordle game',
  state: 'open',
  merged: false,
  html_url: 'https://github.com/Sherman05/factory/pull/42',
  updated_at: '2026-04-18T10:00:00Z',
  head_ref: 'feat/wordle'
};

describe('prMessages', () => {
  it('formats opened PR with number, title and url', () => {
    expect(prMessages.opened(pr)).toBe(
      '🆕 PR #42: feat: add Wordle game — ready for review.\nhttps://github.com/Sherman05/factory/pull/42'
    );
  });

  it('formats merged PR', () => {
    expect(prMessages.merged(pr)).toBe('✅ PR #42 merged into main');
  });

  it('formats closed-without-merge PR', () => {
    expect(prMessages.closed(pr)).toBe('❌ PR #42 closed without merge');
  });
});
