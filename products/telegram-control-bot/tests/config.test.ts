import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: 'abc:123',
      TELEGRAM_OWNER_CHAT_ID: '42',
      HTTP_PORT: '8080',
      FACTORY_REPO_ROOT: '/tmp/factory',
      GITHUB_REPO_SLUG: 'Sherman05/factory'
    });
    expect(config).toEqual({
      TELEGRAM_BOT_TOKEN: 'abc:123',
      TELEGRAM_OWNER_CHAT_ID: 42,
      HTTP_PORT: 8080,
      FACTORY_REPO_ROOT: '/tmp/factory',
      GITHUB_REPO_SLUG: 'Sherman05/factory'
    });
  });

  it('defaults HTTP_PORT to 8080 when absent', () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: 'abc:123',
      TELEGRAM_OWNER_CHAT_ID: '42',
      FACTORY_REPO_ROOT: '/tmp/factory',
      GITHUB_REPO_SLUG: 'Sherman05/factory'
    });
    expect(config.HTTP_PORT).toBe(8080);
  });

  it('throws when FACTORY_REPO_ROOT is missing', () => {
    expect(() =>
      loadConfig({
        TELEGRAM_BOT_TOKEN: 'abc:123',
        TELEGRAM_OWNER_CHAT_ID: '42',
        GITHUB_REPO_SLUG: 'Sherman05/factory'
      })
    ).toThrow(/FACTORY_REPO_ROOT/);
  });

  it('throws when GITHUB_REPO_SLUG is missing', () => {
    expect(() =>
      loadConfig({
        TELEGRAM_BOT_TOKEN: 'abc:123',
        TELEGRAM_OWNER_CHAT_ID: '42',
        FACTORY_REPO_ROOT: '/tmp/factory'
      })
    ).toThrow(/GITHUB_REPO_SLUG/);
  });

  it('throws when GITHUB_REPO_SLUG has the wrong shape', () => {
    expect(() =>
      loadConfig({
        TELEGRAM_BOT_TOKEN: 'abc:123',
        TELEGRAM_OWNER_CHAT_ID: '42',
        FACTORY_REPO_ROOT: '/tmp/factory',
        GITHUB_REPO_SLUG: 'not-a-valid-slug'
      })
    ).toThrow(/GITHUB_REPO_SLUG/);
  });

  it('throws a helpful error when TELEGRAM_BOT_TOKEN is missing', () => {
    expect(() =>
      loadConfig({
        TELEGRAM_OWNER_CHAT_ID: '42',
        FACTORY_REPO_ROOT: '/tmp/factory',
        GITHUB_REPO_SLUG: 'Sherman05/factory'
      })
    ).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it('throws when TELEGRAM_OWNER_CHAT_ID is not numeric', () => {
    expect(() =>
      loadConfig({
        TELEGRAM_BOT_TOKEN: 'abc:123',
        TELEGRAM_OWNER_CHAT_ID: 'not-a-number',
        FACTORY_REPO_ROOT: '/tmp/factory',
        GITHUB_REPO_SLUG: 'Sherman05/factory'
      })
    ).toThrow(/TELEGRAM_OWNER_CHAT_ID/);
  });

  it('throws when TELEGRAM_BOT_TOKEN is an empty string', () => {
    expect(() =>
      loadConfig({
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_OWNER_CHAT_ID: '42',
        FACTORY_REPO_ROOT: '/tmp/factory',
        GITHUB_REPO_SLUG: 'Sherman05/factory'
      })
    ).toThrow(/TELEGRAM_BOT_TOKEN/);
  });
});
