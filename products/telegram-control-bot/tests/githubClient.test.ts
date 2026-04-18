import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import { GitHubApiError, makeGitHubClient } from '../src/githubClient.ts';

const repoSlug = 'Sherman05/factory';
const path = '/repos/Sherman05/factory/pulls?state=all&per_page=20&sort=updated&direction=desc';

let originalDispatcher: Dispatcher;
let mockAgent: MockAgent;

beforeEach(() => {
  originalDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(originalDispatcher);
});

describe('makeGitHubClient.listPulls', () => {
  it('fetches PRs with auth header and maps merged_at to merged boolean', async () => {
    const pool = mockAgent.get('https://api.github.com');
    pool
      .intercept({ path, method: 'GET' })
      .reply(
        200,
        [
          {
            number: 5,
            title: 'feat: add Wordle',
            state: 'open',
            merged_at: null,
            html_url: 'https://github.com/Sherman05/factory/pull/5',
            updated_at: '2026-04-18T10:00:00Z'
          },
          {
            number: 4,
            title: 'chore: bump deps',
            state: 'closed',
            merged_at: '2026-04-17T18:00:00Z',
            html_url: 'https://github.com/Sherman05/factory/pull/4',
            updated_at: '2026-04-17T18:00:00Z'
          }
        ],
        { headers: { 'content-type': 'application/json' } }
      );

    const client = makeGitHubClient({ token: 'ghp_x', repoSlug });
    const prs = await client.listPulls();

    expect(prs).toHaveLength(2);
    expect(prs[0]).toMatchObject({ number: 5, state: 'open', merged: false });
    expect(prs[1]).toMatchObject({ number: 4, state: 'closed', merged: true });
  });

  it('throws GitHubApiError on 401', async () => {
    const pool = mockAgent.get('https://api.github.com');
    pool.intercept({ path, method: 'GET' }).reply(401, 'Bad credentials');

    const client = makeGitHubClient({ token: 'bad', repoSlug });
    await expect(client.listPulls()).rejects.toBeInstanceOf(GitHubApiError);
  });

  it('exposes retry-after header on 429', async () => {
    const pool = mockAgent.get('https://api.github.com');
    pool
      .intercept({ path, method: 'GET' })
      .reply(429, 'rate limited', { headers: { 'retry-after': '42' } });

    const client = makeGitHubClient({ token: 'ghp_x', repoSlug });
    try {
      await client.listPulls();
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubApiError);
      expect((err as GitHubApiError).status).toBe(429);
      expect((err as GitHubApiError).retryAfter).toBe(42);
    }
  });

  it('throws GitHubApiError on 5xx', async () => {
    const pool = mockAgent.get('https://api.github.com');
    pool.intercept({ path, method: 'GET' }).reply(503, 'upstream down');

    const client = makeGitHubClient({ token: 'ghp_x', repoSlug });
    await expect(client.listPulls()).rejects.toMatchObject({ status: 503 });
  });
});
