import { Module } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Queue } from 'bullmq';
import { fulfillmentOutbox, fulfillmentProcessedMessages, type Db } from '@tickethub/db';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { OutboxRepository, InboxRepository } from '@tickethub/outbox';
import { bullConnection } from '@tickethub/redis';
import { rmqRootModule, OutboxModule } from '@tickethub/rmq';
import { StorageModule, StorageClient } from '@tickethub/storage';
import { MailerModule, Mailer } from '@tickethub/mailer';
import { TicketsController } from './tickets/tickets.controller';
import { NotifyController } from './notify/notify.controller';
import { OrganizerStatsController } from './organizer/stats.controller';
import { OrganizerStatsService } from './organizer/stats.service';
import { TicketsService } from './tickets/tickets.service';
import { startEmailWorker } from './notify/email.worker';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;
const get = <K extends keyof Config>(config: Cfg, key: K) => config.get(key, { infer: true });

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    DbModule.forRoot(),
    OutboxModule.forFeature({ outbox: fulfillmentOutbox, processed: fulfillmentProcessedMessages }),
    rmqRootModule(),
    StorageModule.forBucket('S3_BUCKET_TICKETS'),
    MailerModule,
  ],
  controllers: [TicketsController, NotifyController, OrganizerStatsController],
  providers: [
    {
      provide: OrganizerStatsService,
      inject: ['DB'],
      useFactory: (db: Db) => new OrganizerStatsService(db),
    },
    // A useFactory, not @Injectable auto-wiring: the qrSecret is a plain string and Nest has no
    // type to resolve it by.
    {
      provide: TicketsService,
      inject: [
        'DB',
        StorageClient,
        AmqpConnection,
        OutboxRepository,
        InboxRepository,
        ConfigService,
      ],
      useFactory: (
        db: Db,
        storage: StorageClient,
        amqp: AmqpConnection,
        outbox: OutboxRepository,
        inbox: InboxRepository,
        config: Cfg,
      ) => new TicketsService(db, storage, amqp, outbox, inbox, get(config, 'TICKET_QR_SECRET')),
    },
    {
      provide: 'EMAIL_QUEUE',
      inject: [ConfigService],
      useFactory: (config: Cfg) =>
        new Queue('send-ticket-email', {
          connection: bullConnection(get(config, 'REDIS_URL')),
          // Email is the one step a customer notices going missing: retry hard before giving up.
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
          },
        }),
    },
    {
      provide: 'EMAIL_WORKER',
      inject: [AmqpConnection, StorageClient, Mailer, ConfigService],
      useFactory: (amqp: AmqpConnection, storage: StorageClient, mailer: Mailer, config: Cfg) =>
        startEmailWorker({ amqp, storage, mailer }, bullConnection(get(config, 'REDIS_URL'))),
    },
  ],
})
export class FulfillmentModule {}
