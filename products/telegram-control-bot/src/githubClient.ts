import { fetch as undiciFetch } from 'undici';
import type { GitHubPR } from './messages.ts';

export interface GitHubClient {
  listPulls(): Promise<GitHubPR[]>;
  getPr(number: number): Promise<GitHubPR>;
  mergePr(number: number): Promise<void>;
  closePr(number: number): Promise<void>;
  deleteBranch(ref: string): Promise<void>;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
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
  head: { ref: string };
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

function mapPull(p: RawPull): GitHubPR {
  return {
    number: p.number,
    title: p.title,
    state: p.state,
    merged: p.merged_at !== null,
    html_url: p.html_url,
    updated_at: p.updated_at,
    head_ref: p.head.ref
  };
}

export function makeGitHubClient(deps: GitHubClientDeps): GitHubClient {
  const f: FetchLike = deps.fetchImpl ?? (undiciFetch as unknown as FetchLike);
  const base = `https://api.github.com/repos/${deps.repoSlug}`;
  const headers = {
    Authorization: `Bearer ${deps.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'telegram-control-bot'
  };

  const request = async (
    path: string,
    init: { method?: string; body?: unknown } = {}
  ) => {
    const res = await f(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...headers,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined
    });
    if (!res.ok) {
      const body = await res.text();
      const retryHeader = res.headers.get('retry-after');
      const retryAfter = retryHeader ? Number(retryHeader) : undefined;
      throw new GitHubApiError(res.status, body, retryAfter);
    }
    return res;
  };

  return {
    async listPulls() {
      const res = await request('/pulls?state=all&per_page=20&sort=updated&direction=desc');
      const raw = (await res.json()) as RawPull[];
      return raw.map(mapPull);
    },
    async getPr(number) {
      const res = await request(`/pulls/${number}`);
      const raw = (await res.json()) as RawPull;
      return mapPull(raw);
    },
    async mergePr(number) {
      await request(`/pulls/${number}/merge`, {
        method: 'PUT',
        body: { merge_method: 'squash' }
      });
    },
    async closePr(number) {
      await request(`/pulls/${number}`, {
        method: 'PATCH',
        body: { state: 'closed' }
      });
    },
    async deleteBranch(ref) {
      await request(`/git/refs/heads/${ref}`, { method: 'DELETE' });
    }
  };
}
