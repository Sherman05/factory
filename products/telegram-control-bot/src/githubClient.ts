import { fetch as undiciFetch } from 'undici';
import type { GitHubPR } from './messages.ts';

export interface GitHubClient {
  listPulls(): Promise<GitHubPR[]>;
}

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface GitHubClientDeps {
  token: string;
  repoSlug: string;
  fetchImpl?: FetchLike;
}

interface RawPull {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  html_url: string;
  updated_at: string;
}

export class GitHubApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public retryAfter?: number
  ) {
    super(`GitHub API error ${status}: ${body.slice(0, 200)}`);
    this.name = 'GitHubApiError';
  }
}

export function makeGitHubClient(deps: GitHubClientDeps): GitHubClient {
  const f: FetchLike = deps.fetchImpl ?? (undiciFetch as unknown as FetchLike);
  const url = `https://api.github.com/repos/${deps.repoSlug}/pulls?state=all&per_page=20&sort=updated&direction=desc`;
  return {
    async listPulls() {
      const res = await f(url, {
        headers: {
          Authorization: `Bearer ${deps.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'telegram-control-bot'
        }
      });
      if (!res.ok) {
        const body = await res.text();
        const retryHeader = res.headers.get('retry-after');
        const retryAfter = retryHeader ? Number(retryHeader) : undefined;
        throw new GitHubApiError(res.status, body, retryAfter);
      }
      const raw = (await res.json()) as RawPull[];
      return raw.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        merged: p.merged_at !== null,
        html_url: p.html_url,
        updated_at: p.updated_at
      }));
    }
  };
}
