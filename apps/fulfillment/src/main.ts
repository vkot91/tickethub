import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { RequestIdInterceptor } from '@tickethub/rmq';

import { FulfillmentModule } from './fulfillment.module';

async function bootstrap() {
  // golevelup discovers every @RabbitSubscribe via module scanning on bootstrap, so there are no
  // microservices to attach. Fulfillment has no HTTP port — init() is enough.
  const app = await NestFactory.create(FulfillmentModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());

  await app.init();
}
void bootstrap();
