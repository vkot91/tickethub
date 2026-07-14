import { Module } from '@nestjs/common';
import { ClientsModule, ClientProxy, type RmqOptions } from '@nestjs/microservices';
import { createDb, paymentsOutbox, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { OutboxRepository, OutboxPoller } from '@tickethub/outbox';
import { rmqClientOptions } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
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
    ClientsModule.registerAsync([
      {
        name: 'ORDERS_RPC',
        inject: [ConfigService],
        useFactory: (c: Cfg): RmqOptions =>
          rmqClientOptions(QUEUES.ordersRpc, get(c, 'RABBITMQ_URL')),
      },
      {
        name: 'EVENTS_BUS',
        inject: [ConfigService],
        useFactory: (c: Cfg): RmqOptions =>
          rmqClientOptions(QUEUES.paymentsEvents, get(c, 'RABBITMQ_URL')),
      },
    ]),
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
    { provide: OutboxRepository, useFactory: () => new OutboxRepository() },
    {
      provide: PaymentsService,
      inject: ['DB', StripeClient, 'ORDERS_RPC', OutboxRepository],
      useFactory: (
        db: Db,
        stripe: StripeClient,
        ordersRpc: ClientProxy,
        outbox: OutboxRepository,
      ) => new PaymentsService(db, stripe, ordersRpc, outbox),
    },
    {
      provide: OutboxPoller,
      inject: ['DB', 'EVENTS_BUS'],
      useFactory: (db: Db, client: ClientProxy) => new OutboxPoller(db, paymentsOutbox, client),
    },
  ],
})
export class PaymentsModule {}
