import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

export interface ServerDeps {
  sendNotification: (title: string, url: string) => Promise<void>;
  logger?: boolean;
}

const NotifyBody = z.object({
  title: z.string().min(1),
  url: z.string().url()
});

export function createServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

  app.post('/notify', async (request, reply) => {
    const parsed = NotifyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'invalid body', details: parsed.error.flatten().fieldErrors });
    }
    try {
      await deps.sendNotification(parsed.data.title, parsed.data.url);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      request.log.error({ err }, 'notify: sendNotification failed');
      return reply.code(502).send({ error: 'telegram api failed' });
    }
  });

  return app;
}
