import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { loadEnv } from '@tickethub/config';
import { RequestIdInterceptor, rmqClientOptions } from '@tickethub/rmq';
import { HttpToRpcExceptionFilter } from '@tickethub/common';
import { QUEUES } from '@tickethub/contracts';
import { PaymentsModule } from './payments.module';
import { schema } from './config';

async function bootstrap() {
  loadEnv();
  const cfg = schema.parse(process.env);

  // Hybrid app so we can bind two inbound RMQ queues: our own RPC (payments.rpc) and the
  // Orders publisher queue (orders.events) we consume refund.requested from. INestMicroservice
  // has no connectMicroservice, so we create a full app and attach both microservices to it.
  const app = await NestFactory.create(PaymentsModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new HttpToRpcExceptionFilter());

  app.connectMicroservice<MicroserviceOptions>(
    rmqClientOptions(QUEUES.paymentsRpc, cfg.RABBITMQ_URL),
  );
  app.connectMicroservice<MicroserviceOptions>(
    rmqClientOptions(QUEUES.ordersEvents, cfg.RABBITMQ_URL),
  );

  await app.startAllMicroservices();
  await app.init();
}
void bootstrap();
