import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  // Sliding-window rate limit over a ZSET scored by timestamp: drop entries older
  // than the window, record this hit, count what's left — one MULTI round-trip.
  // ponytail: rejected hits still occupy a slot (punishes floods); a check-then-add
  // race can admit a couple extra under heavy concurrency — fine for a gateway limit.
  async slidingWindow(key: string, limit: number, windowMs: number) {
    const now = Date.now();

    const results = await this.client
      .multi()
      .zremrangebyscore(key, 0, now - windowMs)
      .zadd(key, now, `${now}-${randomUUID()}`)
      .zcard(key)
      .pexpire(key, windowMs)
      .exec();

    const count = results![2][1] as number; // reply of ZCARD

    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}
