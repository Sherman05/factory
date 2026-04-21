import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  const base = {
    TELEGRAM_BOT_TOKEN: 'abc:123',
    TELEGRAM_OWNER_CHAT_ID: '42',
    FACTORY_REPO_ROOT: '/tmp/factory',
    GITHUB_REPO_SLUG: 'Sherman05/factory',
    GITHUB_TOKEN: 'ghp_test'
  };

  it('parses a valid environment', () => {
    const config = loadConfig({ ...base, HTTP_PORT: '8080' });
    expect(config.TELEGRAM_BOT_TOKEN).toBe('abc:123');
    expect(config.TELEGRAM_OWNER_CHAT_ID).toBe(42);
    expect(config.HTTP_PORT).toBe(8080);
    expect(config.FACTORY_REPO_ROOT).toBe('/tmp/factory');
    expect(config.GITHUB_REPO_SLUG).toBe('Sherman05/factory');
    expect(config.GITHUB_TOKEN).toBe('ghp_test');
    expect(config.POLL_INTERVAL_MS).toBe(120000);
  });

  it('defaults CLAUDE_CLI_PATH to "claude"', () => {
    const config = loadConfig(base);
    expect(config.CLAUDE_CLI_PATH).toBe('claude');
  });

  it('defaults WORKER_TICK_MS to 2000', () => {
    const config = loadConfig(base);
    expect(config.WORKER_TICK_MS).toBe(2000);
  });

  it('defaults TASK_DB_PATH to <repo>/.agent-factory/tasks.db', () => {
    const config = loadConfig(base);
    expect(config.TASK_DB_PATH.replace(/\\/g, '/')).toBe(
      '/tmp/factory/.agent-factory/tasks.db'
    );
  });

  it('defaults WORKTREES_ROOT to <repo>/.worktrees', () => {
    const config = loadConfig(base);
    expect(config.WORKTREES_ROOT.replace(/\\/g, '/')).toBe('/tmp/factory/.worktrees');
  });

  it('respects an explicit TASK_DB_PATH override', () => {
    const config = loadConfig({ ...base, TASK_DB_PATH: '/var/lib/tasks.db' });
    expect(config.TASK_DB_PATH).toBe('/var/lib/tasks.db');
  });

  it('respects an explicit WORKTREES_ROOT override', () => {
    const config = loadConfig({ ...base, WORKTREES_ROOT: '/var/wt' });
    expect(config.WORKTREES_ROOT).toBe('/var/wt');
  });

  it('defaults HTTP_PORT to 8080 when absent', () => {
    const config = loadConfig(base);
    expect(config.HTTP_PORT).toBe(8080);
  });

  it('defaults POLL_INTERVAL_MS to 120000 when absent', () => {
    const config = loadConfig(base);
    expect(config.POLL_INTERVAL_MS).toBe(120000);
  });

  it('coerces POLL_INTERVAL_MS from string', () => {
    const config = loadConfig({ ...base, POLL_INTERVAL_MS: '5000' });
    expect(config.POLL_INTERVAL_MS).toBe(5000);
  });

  it('throws when FACTORY_REPO_ROOT is missing', () => {
    const { FACTORY_REPO_ROOT: _, ...env } = base;
    expect(() => loadConfig(env)).toThrow(/FACTORY_REPO_ROOT/);
  });

  it('throws when GITHUB_REPO_SLUG is missing', () => {
    const { GITHUB_REPO_SLUG: _, ...env } = base;
    expect(() => loadConfig(env)).toThrow(/GITHUB_REPO_SLUG/);
  });

  it('throws when GITHUB_REPO_SLUG has the wrong shape', () => {
    expect(() =>
      loadConfig({ ...base, GITHUB_REPO_SLUG: 'not-a-valid-slug' })
    ).toThrow(/GITHUB_REPO_SLUG/);
  });

  it('throws a helpful error when TELEGRAM_BOT_TOKEN is missing', () => {
    const { TELEGRAM_BOT_TOKEN: _, ...env } = base;
    expect(() => loadConfig(env)).toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it('throws when TELEGRAM_OWNER_CHAT_ID is not numeric', () => {
    expect(() =>
      loadConfig({ ...base, TELEGRAM_OWNER_CHAT_ID: 'not-a-number' })
    ).toThrow(/TELEGRAM_OWNER_CHAT_ID/);
  });

  it('throws when TELEGRAM_BOT_TOKEN is an empty string', () => {
    expect(() => loadConfig({ ...base, TELEGRAM_BOT_TOKEN: '' })).toThrow(
      /TELEGRAM_BOT_TOKEN/
    );
  });

  it('throws when GITHUB_TOKEN is missing', () => {
    const { GITHUB_TOKEN: _, ...env } = base;
    expect(() => loadConfig(env)).toThrow(/GITHUB_TOKEN/);
  });

  it('throws when GITHUB_TOKEN is empty', () => {
    expect(() => loadConfig({ ...base, GITHUB_TOKEN: '' })).toThrow(
      /GITHUB_TOKEN/
    );
  });
});
