import { HttpException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

function ctx() {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip: '1.2.3.4', path: '/events' }) }),
  } as never;
}

describe('RateLimitGuard', () => {
  it('allows requests under the limit', async () => {
    const redis = { slidingWindow: jest.fn().mockResolvedValue({ allowed: true }) };
    await expect(new RateLimitGuard(redis as never).canActivate(ctx())).resolves.toBe(true);
    expect(redis.slidingWindow).toHaveBeenCalledWith('rl:1.2.3.4:/events', 60, 60_000);
  });

  it('throws 429 once the limit is exceeded', async () => {
    const redis = { slidingWindow: jest.fn().mockResolvedValue({ allowed: false }) };
    await expect(new RateLimitGuard(redis as never).canActivate(ctx())).rejects.toThrow(
      HttpException,
    );
  });
});
