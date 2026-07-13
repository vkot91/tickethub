import { loadEnv, requireEnv } from '@tickethub/env';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('RedisService.slidingWindow (integration)', () => {
  let client: Redis;
  let svc: RedisService;
  beforeAll(() => {
    loadEnv();
    client = new Redis(requireEnv('REDIS_URL'));
    svc = new RedisService(client);
  });
  afterAll(async () => {
    await client.quit();
  });
  beforeEach(async () => {
    await client.flushall();
  });

  it('allows requests under the limit and blocks over it', async () => {
    const key = 'rl:test';
    const first = await svc.slidingWindow(key, 2, 1000);
    const second = await svc.slidingWindow(key, 2, 1000);
    const third = await svc.slidingWindow(key, 2, 1000);
    expect(first).toEqual({ allowed: true, remaining: 1 });
    expect(second).toEqual({ allowed: true, remaining: 0 });
    expect(third).toEqual({ allowed: false, remaining: 0 });
  });

  it('backs the counter with a sorted set (real sliding window, not a bare counter)', async () => {
    const key = 'rl:test';
    await svc.slidingWindow(key, 5, 1000);
    expect(await client.type(key)).toBe('zset');
  });

  it('lets old entries slide out of the window so the caller is allowed again', async () => {
    const key = 'rl:test';
    await svc.slidingWindow(key, 1, 300);
    const blocked = await svc.slidingWindow(key, 1, 300);
    expect(blocked.allowed).toBe(false);

    await sleep(350); // first entry ages past the 300ms window

    const afterWindow = await svc.slidingWindow(key, 1, 300);
    expect(afterWindow.allowed).toBe(true);
  });
});
