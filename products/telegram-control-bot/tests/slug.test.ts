import { describe, expect, it } from 'vitest';
import { toSlug } from '../src/slug.ts';

describe('toSlug', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(toSlug('Hello World')).toBe('hello-world');
  });

  it('transliterates Cyrillic to Latin', () => {
    expect(toSlug('Привет мир!')).toBe('privet-mir');
  });

  it('transliterates a longer Russian phrase', () => {
    expect(toSlug('Сделай мне Wordle-клон на React')).toBe(
      'sdelai-mne-wordle-klon-na-react'
    );
  });

  it('trims leading and trailing whitespace', () => {
    expect(toSlug('   spaces   ')).toBe('spaces');
  });

  it('truncates to at most 60 characters', () => {
    const input = 'a'.repeat(200);
    const slug = toSlug(input);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('truncates a long Cyrillic string to 60 characters', () => {
    const input = 'абв'.repeat(30);
    const slug = toSlug(input);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('drops trailing dashes after truncation', () => {
    expect(toSlug('word---')).toBe('word');
    expect(toSlug('a'.repeat(60) + ' ' + 'b'.repeat(60))).not.toMatch(/-$/);
  });

  it('collapses non-alphanumeric runs to a single dash', () => {
    expect(toSlug('foo!!!bar???baz')).toBe('foo-bar-baz');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(toSlug('   ')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(toSlug('')).toBe('');
  });
});
