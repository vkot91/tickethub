import { NestFactory } from '@nestjs/core';
import { RequestIdInterceptor } from '@tickethub/rmq';
import { Logger } from 'nestjs-pino';
import { OrdersModule } from './orders.module';

async function bootstrap() {
  // golevelup discovers every @RabbitRPC/@RabbitSubscribe via module scanning on bootstrap.
  // Orders has no HTTP port — init() is enough (it also starts the BullMQ release worker).
  const app = await NestFactory.create(OrdersModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());

  await app.init();
}
bootstrap();
