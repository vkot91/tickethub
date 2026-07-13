import { RedisService } from './index';

// The sliding window is a MULTI pipeline; here we stub it and assert the ZCARD reply
// is mapped to allowed/remaining. Real Redis behaviour lives in the integration spec.
function makeClient(zcardReply: number) {
  const pipeline: Record<string, jest.Mock> = {};
  for (const cmd of ['zremrangebyscore', 'zadd', 'zcard', 'pexpire']) {
    pipeline[cmd] = jest.fn(() => pipeline);
  }
  pipeline.exec = jest.fn().mockResolvedValue([
    [null, 0],
    [null, 1],
    [null, zcardReply],
    [null, 1],
  ]);
  return { multi: () => pipeline };
}

describe('RedisService.slidingWindow', () => {
  it('allows and reports remaining when under the limit', async () => {
    const svc = new RedisService(makeClient(1) as never);

    const res = await svc.slidingWindow('rl:a', 60, 60_000);

    expect(res).toEqual({ allowed: true, remaining: 59 });
  });

  it('blocks once the count exceeds the limit', async () => {
    const svc = new RedisService(makeClient(3) as never);

    const res = await svc.slidingWindow('rl:a', 2, 1000);

    expect(res).toEqual({ allowed: false, remaining: 0 });
  });
});

// Minimal fake: SET NX support (returns null if key exists) + DEL.
class FakeRedis {
  store = new Map<string, string>();
  async set(key: string, _val: string, ..._args: unknown[]) {
    if (this.store.has(key)) return null; // NX fails
    this.store.set(key, '1');
    return 'OK';
  }
  async del(...keys: string[]) {
    keys.forEach((k) => this.store.delete(k));
    return keys.length;
  }
}

describe('RedisService seat locks', () => {
  it('acquires all locks when free', async () => {
    const svc = new RedisService(new FakeRedis() as never);
    expect(await svc.acquireSeatLocks(['seat-lock:e:1', 'seat-lock:e:2'], 600)).toBe(true);
  });

  it('is all-or-nothing: releases the ones taken if any is held', async () => {
    const redis = new FakeRedis();
    redis.store.set('seat-lock:e:2', 'x'); // seat 2 already held
    const svc = new RedisService(redis as never);
    expect(await svc.acquireSeatLocks(['seat-lock:e:1', 'seat-lock:e:2'], 600)).toBe(false);
    expect(redis.store.has('seat-lock:e:1')).toBe(false); // rolled back
  });
});
