import { Module } from '@nestjs/common';
import { RabbitMQModule, AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Queue } from 'bullmq';
import { createDb, ordersOutbox, ordersProcessedMessages, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RedisModule, RedisService } from '@tickethub/redis';
import { OutboxRepository, InboxRepository, OutboxPoller } from '@tickethub/outbox';
import { rmqConfig, publishEvent } from '@tickethub/rmq';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { startReleaseWorker } from './release.worker';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;
const get = <K extends keyof Config>(c: Cfg, k: K) => c.get(k, { infer: true });

// BullMQ wants a discrete host/port, not a URL.
const bullConnection = (redisUrl: string) => {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379) };
};

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    RedisModule,
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: Cfg) => rmqConfig(get(config, 'RABBITMQ_URL'), true),
    }),
  ],
  controllers: [OrdersController],
  providers: [
    {
      provide: 'DB',
      inject: [ConfigService],
      useFactory: (config: Cfg): Db => createDb(get(config, 'DATABASE_URL')),
    },
    {
      provide: 'RELEASE_QUEUE',
      inject: [ConfigService],
      useFactory: (config: Cfg) =>
        new Queue('orders.release', { connection: bullConnection(get(config, 'REDIS_URL')) }),
    },
    // The outbox tables are named here and nowhere else — services speak in messages.
    {
      provide: OutboxRepository,
      inject: ['DB'],
      useFactory: (db: Db) => new OutboxRepository(db, ordersOutbox),
    },
    {
      provide: InboxRepository,
      useFactory: () => new InboxRepository(ordersProcessedMessages),
    },
    {
      provide: OrdersService,
      inject: [
        'DB',
        RedisService,
        OutboxRepository,
        InboxRepository,
        'RELEASE_QUEUE',
        ConfigService,
      ],
      useFactory: (
        db: Db,
        redis: RedisService,
        outbox: OutboxRepository,
        inbox: InboxRepository,
        queue: Queue,
        config: Cfg,
      ) => new OrdersService(db, redis, outbox, inbox, queue, get(config, 'RESERVATION_TTL_SEC')),
    },
    {
      provide: OutboxPoller,
      inject: [OutboxRepository, AmqpConnection],
      useFactory: (outbox: OutboxRepository, amqp: AmqpConnection) =>
        new OutboxPoller(outbox, (rk, p) => publishEvent(amqp, rk, p)),
    },
    {
      provide: 'RELEASE_WORKER',
      inject: [OrdersService, ConfigService],
      useFactory: (svc: OrdersService, config: Cfg) =>
        startReleaseWorker(svc, bullConnection(get(config, 'REDIS_URL'))),
    },
  ],
})
export class OrdersModule {}
