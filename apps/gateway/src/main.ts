import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { RpcToHttpExceptionFilter } from '@tickethub/common';

import { AppModule } from './app.module';
import { schema } from './config';
import { RedisIoAdapter } from './seat-map/redis-io.adapter';

async function bootstrap() {
  const cfg = schema.parse(process.env);
  // rawBody so the Stripe webhook route can forward the exact bytes for signature verification.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new RpcToHttpExceptionFilter());

  // Without this, a seat-map broadcast reaches only the sockets held by the replica that happened
  // to consume the RMQ message. See RedisIoAdapter.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(cfg.REDIS_URL);
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(cfg.PORT);
}
bootstrap();
