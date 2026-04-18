export interface GitHubPR {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  html_url: string;
  updated_at: string;
  head_ref: string;
}

export const prMessages = {
  opened: (pr: GitHubPR): string =>
    `🆕 PR #${pr.number}: ${pr.title} — ready for review.\n${pr.html_url}`,
  merged: (pr: GitHubPR): string => `✅ PR #${pr.number} merged into main`,
  closed: (pr: GitHubPR): string => `❌ PR #${pr.number} closed without merge`
};
