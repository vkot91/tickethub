import { DynamicModule } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@tickethub/config';
import { rmqConfig } from './rmq.config';

// The RabbitMQ registration every service repeated. Marked `global: true` so AmqpConnection is
// injectable app-wide — the OutboxModule poller lives in its own module and would otherwise not
// see it (golevelup's module only exports to its direct importer).
//
// `wait` defaults to true: RPC/worker services have no HTTP listener, so init() must await the
// AMQP connection to keep the process alive. An HTTP gateway passes false.
export function rmqRootModule(wait = true): DynamicModule {
  return {
    ...RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        rmqConfig(config.getOrThrow<string>('RABBITMQ_URL'), wait),
    }),
    global: true,
  };
}
