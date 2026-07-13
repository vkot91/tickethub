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
    const svc = new RedisService(makeClient(1) as any);

    const res = await svc.slidingWindow('rl:a', 60, 60_000);

    expect(res).toEqual({ allowed: true, remaining: 59 });
  });

  it('blocks once the count exceeds the limit', async () => {
    const svc = new RedisService(makeClient(3) as any);

    const res = await svc.slidingWindow('rl:a', 2, 1000);

    expect(res).toEqual({ allowed: false, remaining: 0 });
  });
});
