import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { RequestIdInterceptor } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
import { Logger } from 'nestjs-pino';
import { EventsModule } from './events.module';
import { schema } from './config';

async function bootstrap() {
  const cfg = schema.parse(process.env);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(EventsModule, {
    transport: Transport.RMQ,
    options: { urls: [cfg.RABBITMQ_URL], queue: QUEUES.eventsRpc, queueOptions: { durable: true } },
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());
  await app.listen();
}
bootstrap();
