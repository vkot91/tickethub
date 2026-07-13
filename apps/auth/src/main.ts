import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { RequestIdInterceptor } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
import { Logger } from 'nestjs-pino';
import { AuthModule } from './auth.module';
import { schema } from './config';

async function bootstrap() {
  const cfg = schema.parse(process.env);
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.RMQ,
    options: { urls: [cfg.RABBITMQ_URL], queue: QUEUES.authRpc, queueOptions: { durable: true } },
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());
  await app.listen();
}
bootstrap();
