import slugify from 'slugify';

slugify.extend({ 'й': 'i', 'Й': 'I' });

const MAX_LENGTH = 60;

export function toSlug(input: string): string {
  const tokens = input.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return '';
  const transliterated = slugify(tokens.join(' '), { lower: true });
  const normalized = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(0, MAX_LENGTH).replace(/-+$/, '');
}
