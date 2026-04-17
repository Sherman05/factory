import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../src/server.ts';

function buildApp(notify = vi.fn().mockResolvedValue(undefined)) {
  const app = createServer({ sendNotification: notify });
  return { app, notify };
}

describe('POST /notify', () => {
  it('returns 200 and calls sendNotification for a valid body', async () => {
    const { app, notify } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/notify',
      payload: { title: 'PR ready', url: 'https://example.com/pr/1' }
    });

    expect(res.statusCode).toBe(200);
    expect(notify).toHaveBeenCalledWith('PR ready', 'https://example.com/pr/1');
  });

  it('returns 400 when the body is empty', async () => {
    const { app, notify } = buildApp();

    const res = await app.inject({ method: 'POST', url: '/notify', payload: {} });

    expect(res.statusCode).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns 400 when title is present but url is missing', async () => {
    const { app, notify } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/notify',
      payload: { title: 'only title' }
    });

    expect(res.statusCode).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns 400 when url is not a valid URL', async () => {
    const { app, notify } = buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/notify',
      payload: { title: 't', url: 'not-a-url' }
    });

    expect(res.statusCode).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it('returns 502 when sendNotification throws', async () => {
    const notify = vi.fn().mockRejectedValue(new Error('telegram down'));
    const { app } = buildApp(notify);

    const res = await app.inject({
      method: 'POST',
      url: '/notify',
      payload: { title: 't', url: 'https://example.com' }
    });

    expect(res.statusCode).toBe(502);
  });
});
