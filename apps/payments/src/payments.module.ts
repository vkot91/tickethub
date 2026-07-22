import { Module } from '@nestjs/common';
import { RabbitMQModule, AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { createDb, paymentsOutbox, paymentsProcessedMessages, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { OutboxRepository, InboxRepository, OutboxPoller } from '@tickethub/outbox';
import { rmqConfig, publishEvent } from '@tickethub/rmq';
import { PaymentsController } from './payments.controller';
import { WebhookController } from './webhook.controller';
import { PaymentsService } from './payments.service';
import { StripeClient } from './stripe.client';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;
const get = <K extends keyof Config>(c: Cfg, k: K) => c.get(k, { infer: true });

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (c: Cfg) => rmqConfig(get(c, 'RABBITMQ_URL'), true),
    }),
  ],
  controllers: [PaymentsController, WebhookController],
  providers: [
    {
      provide: 'DB',
      inject: [ConfigService],
      useFactory: (c: Cfg): Db => createDb(get(c, 'DATABASE_URL')),
    },
    {
      provide: StripeClient,
      inject: [ConfigService],
      useFactory: (c: Cfg) =>
        StripeClient.fromSecret(get(c, 'STRIPE_SECRET_KEY'), get(c, 'STRIPE_WEBHOOK_SECRET')),
    },
    // The outbox tables are named here and nowhere else — services speak in messages.
    {
      provide: OutboxRepository,
      inject: ['DB'],
      useFactory: (db: Db) => new OutboxRepository(db, paymentsOutbox),
    },
    {
      provide: InboxRepository,
      useFactory: () => new InboxRepository(paymentsProcessedMessages),
    },
    {
      provide: PaymentsService,
      inject: ['DB', StripeClient, AmqpConnection, OutboxRepository, InboxRepository],
      useFactory: (
        db: Db,
        stripe: StripeClient,
        amqp: AmqpConnection,
        outbox: OutboxRepository,
        inbox: InboxRepository,
      ) => new PaymentsService(db, stripe, amqp, outbox, inbox),
    },
    {
      provide: OutboxPoller,
      inject: [OutboxRepository, AmqpConnection],
      useFactory: (outbox: OutboxRepository, amqp: AmqpConnection) =>
        new OutboxPoller(outbox, (rk, p) => publishEvent(amqp, rk, p)),
    },
  ],
})
export class PaymentsModule {}
