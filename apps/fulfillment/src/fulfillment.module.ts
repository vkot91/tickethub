import { Module } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Queue } from 'bullmq';
import { createTransport, type Transporter } from 'nodemailer';
import { fulfillmentOutbox, fulfillmentProcessedMessages, type Db } from '@tickethub/db';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { OutboxRepository, InboxRepository } from '@tickethub/outbox';
import { bullConnection } from '@tickethub/redis';
import { rmqRootModule, OutboxModule } from '@tickethub/rmq';
import { TicketsController } from './tickets/tickets.controller';
import { NotifyController } from './notify/notify.controller';
import { TicketsService } from './tickets/tickets.service';
import { S3Client } from './storage/s3.client';
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
  ],
  controllers: [TicketsController, NotifyController],
  providers: [
    {
      provide: S3Client,
      inject: [ConfigService],
      useFactory: (config: Cfg) =>
        new S3Client({
          endpoint: get(config, 'S3_ENDPOINT'),
          accessKey: get(config, 'S3_ACCESS_KEY'),
          secretKey: get(config, 'S3_SECRET_KEY'),
          bucket: get(config, 'S3_BUCKET_TICKETS'),
        }),
    },
    // A useFactory, not @Injectable auto-wiring: the qrSecret is a plain string and Nest has no
    // type to resolve it by.
    {
      provide: TicketsService,
      inject: ['DB', S3Client, AmqpConnection, OutboxRepository, InboxRepository, ConfigService],
      useFactory: (
        db: Db,
        s3: S3Client,
        amqp: AmqpConnection,
        outbox: OutboxRepository,
        inbox: InboxRepository,
        config: Cfg,
      ) => new TicketsService(db, s3, amqp, outbox, inbox, get(config, 'TICKET_QR_SECRET')),
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
      provide: 'MAILER',
      inject: [ConfigService],
      useFactory: (config: Cfg): Transporter =>
        createTransport({
          host: get(config, 'SMTP_HOST'),
          port: get(config, 'SMTP_PORT'),
          secure: false,
        }),
    },
    {
      provide: 'EMAIL_WORKER',
      inject: [AmqpConnection, S3Client, 'MAILER', ConfigService],
      useFactory: (amqp: AmqpConnection, s3: S3Client, mailer: Transporter, config: Cfg) =>
        startEmailWorker(
          { amqp, s3, mailer, from: get(config, 'MAIL_FROM') },
          bullConnection(get(config, 'REDIS_URL')),
        ),
    },
  ],
})
export class FulfillmentModule {}
