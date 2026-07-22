import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@tickethub/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';

// The URL comes from the importing app's ConfigService, so it goes through the same
// fail-fast Zod validation as every other var. The app's schema must declare REDIS_URL.
type RedisConfig = ConfigService<{ REDIS_URL: string }, true>;

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: RedisConfig) => new Redis(config.get('REDIS_URL', { infer: true })),
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
