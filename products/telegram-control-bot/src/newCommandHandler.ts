import { toSlug } from './slug.ts';
import type { BriefFile, GitWriterResult } from './gitWriter.ts';
import type { Task } from './taskQueue.ts';

export interface NewCommandLogger {
  log: (message: string) => void;
}

export interface NewCommandCtx {
  chat?: { id: number };
  message?: { text?: string };
  reply: (text: string, opts?: Record<string, unknown>) => Promise<unknown>;
}

export type CommitBriefFn = (
  file: BriefFile,
  commitMessage: string
) => Promise<GitWriterResult>;

export type EnqueueTaskFn = (desc: string, createdBy: number) => Task;

export interface NewCommandDeps {
  ownerChatId: number;
  commitBrief: CommitBriefFn;
  enqueueTask: EnqueueTaskFn;
  now: () => Date;
  repoSlug: string;
  logger: NewCommandLogger;
}

export async function handleNew(
  ctx: NewCommandCtx,
  deps: NewCommandDeps
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId !== deps.ownerChatId) {
    deps.logger.log(`ignored: chat_id=${chatId}`);
    return;
  }

  const description = extractDescription(ctx.message?.text ?? '');
  if (!description) {
    await ctx.reply('usage: /new <description>');
    return;
  }

  let task: Task;
  try {
    task = deps.enqueueTask(description, chatId);
  } catch (err) {
    await ctx.reply(`⚠️ queue error: ${errMessage(err)}`);
    return;
  }

  const slug = toSlug(description);
  const now = deps.now();
  const stamp = formatStamp(now);
  const relativePath = `docs/briefs/auto-${slug}-${stamp}.md`;
  const content = renderBrief(description, now);
  const commitMessage = `feat(brief): add auto-generated brief ${slug}`;

  try {
    const result = await deps.commitBrief({ relativePath, content }, commitMessage);
    const url = `https://github.com/${deps.repoSlug}/blob/main/${relativePath}`;
    await ctx.reply(
      `🆕 Task #${task.id} queued: ${description}\n` +
        `Brief: ${relativePath}\n` +
        `commit ${result.shortSha}: ${url}`,
      { link_preview_options: { is_disabled: true } }
    );
  } catch (err) {
    await ctx.reply(
      `🆕 Task #${task.id} queued: ${description}\n⚠️ brief error: ${errMessage(err)}`
    );
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function extractDescription(raw: string): string {
  const match = /^\/new(?:@\S+)?(?:\s+([\s\S]*))?$/i.exec(raw.trim());
  if (!match) return '';
  return (match[1] ?? '').trim();
}

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
  );
}

function renderBrief(description: string, createdAt: Date): string {
  const headline = description.slice(0, 80);
  return `# Auto-brief — ${headline}

**Created:** ${createdAt.toISOString()}
**Via:** Telegram /new from owner
**Status:** Draft — owner needs to refine before feeding to vibe-kanban

## Description (from Telegram)

${description}

## Acceptance criteria

TODO: owner fills in before running through factory.

## Technical stack

TODO: owner or Planner decides.

## Out of scope

TODO.
`;
}
