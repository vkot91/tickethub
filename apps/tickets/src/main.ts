import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { RequestIdInterceptor } from '@tickethub/rmq';

import { TicketsModule } from './tickets.module';

async function bootstrap() {
  // golevelup discovers every @RabbitSubscribe via module scanning on bootstrap, so there are no
  // microservices to attach. Tickets has no HTTP port — init() is enough.
  const app = await NestFactory.create(TicketsModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());

  await app.init();
}
void bootstrap();
