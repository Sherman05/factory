import { z } from 'zod';

const ConfigSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_OWNER_CHAT_ID: z.coerce
    .number({ invalid_type_error: 'TELEGRAM_OWNER_CHAT_ID must be a number' })
    .int('TELEGRAM_OWNER_CHAT_ID must be an integer'),
  HTTP_PORT: z.coerce.number().int().positive().default(8080),
  FACTORY_REPO_ROOT: z.string().min(1, 'FACTORY_REPO_ROOT is required'),
  GITHUB_REPO_SLUG: z
    .string()
    .regex(/^[^\s/]+\/[^\s/]+$/, 'GITHUB_REPO_SLUG must look like "owner/repo"')
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`invalid config: ${issues}`);
  }
  return result.data;
}
