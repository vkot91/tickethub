import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { RequestIdInterceptor } from '@tickethub/rmq';

import { ShowsModule } from './shows.module';

async function bootstrap() {
  // golevelup discovers the @RabbitRPC handlers via module scanning on bootstrap. Shows has
  // no HTTP port — init() is enough.
  const app = await NestFactory.create(ShowsModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());

  await app.init();
}
bootstrap();
