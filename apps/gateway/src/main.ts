import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { RpcToHttpExceptionFilter } from '@tickethub/common';
import { AppModule } from './app.module';
import { schema } from './config';

async function bootstrap() {
  const cfg = schema.parse(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new RpcToHttpExceptionFilter());
  await app.listen(cfg.PORT);
}
bootstrap();
