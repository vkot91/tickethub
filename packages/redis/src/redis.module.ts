import { Global, Module } from '@nestjs/common';
import { requireEnv } from '@tickethub/env';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    { provide: REDIS_CLIENT, useFactory: () => new Redis(requireEnv('REDIS_URL')) },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
