import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { RequestIdInterceptor, rmqClientOptions } from '@tickethub/rmq';
import { HttpToRpcExceptionFilter } from '@tickethub/common';
import { QUEUES } from '@tickethub/contracts';
import { Logger } from 'nestjs-pino';
import { OrdersModule } from './orders.module';
import { schema } from './config';

async function bootstrap() {
  const cfg = schema.parse(process.env);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(OrdersModule, {
    ...rmqClientOptions(QUEUES.ordersRpc, cfg.RABBITMQ_URL),
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new HttpToRpcExceptionFilter());
  await app.listen();
}
bootstrap();
