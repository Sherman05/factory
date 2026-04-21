import { z } from 'zod';
import { join } from 'node:path';

const RawSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_OWNER_CHAT_ID: z.coerce
    .number({ invalid_type_error: 'TELEGRAM_OWNER_CHAT_ID must be a number' })
    .int('TELEGRAM_OWNER_CHAT_ID must be an integer'),
  HTTP_PORT: z.coerce.number().int().positive().default(8080),
  FACTORY_REPO_ROOT: z.string().min(1, 'FACTORY_REPO_ROOT is required'),
  GITHUB_REPO_SLUG: z
    .string()
    .regex(/^[^\s/]+\/[^\s/]+$/, 'GITHUB_REPO_SLUG must look like "owner/repo"'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(120000),
  WORKER_TICK_MS: z.coerce.number().int().positive().default(2000),
  MAX_PARALLEL_TASKS: z.coerce
    .number()
    .int()
    .min(1, 'MAX_PARALLEL_TASKS must be at least 1')
    .max(10, 'MAX_PARALLEL_TASKS must be at most 10')
    .default(3),
  CLAUDE_CLI_PATH: z.string().min(1).default('claude'),
  TASK_DB_PATH: z.string().min(1).optional(),
  WORKTREES_ROOT: z.string().min(1).optional()
});

export interface Config {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_OWNER_CHAT_ID: number;
  HTTP_PORT: number;
  FACTORY_REPO_ROOT: string;
  GITHUB_REPO_SLUG: string;
  GITHUB_TOKEN: string;
  POLL_INTERVAL_MS: number;
  WORKER_TICK_MS: number;
  MAX_PARALLEL_TASKS: number;
  CLAUDE_CLI_PATH: string;
  TASK_DB_PATH: string;
  WORKTREES_ROOT: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = RawSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`invalid config: ${issues}`);
  }
  const raw = result.data;
  return {
    ...raw,
    TASK_DB_PATH:
      raw.TASK_DB_PATH ?? join(raw.FACTORY_REPO_ROOT, '.agent-factory', 'tasks.db'),
    WORKTREES_ROOT: raw.WORKTREES_ROOT ?? join(raw.FACTORY_REPO_ROOT, '.worktrees')
  };
}
