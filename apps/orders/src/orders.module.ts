import { Module } from '@nestjs/common';
import { ClientsModule, ClientProxy, type RmqOptions } from '@nestjs/microservices';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { createDb, ordersOutbox, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RedisService, REDIS_CLIENT } from '@tickethub/redis';
import { OutboxRepository, OutboxPoller } from '@tickethub/outbox';
import { rmqClientOptions } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
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
    ClientsModule.registerAsync([
      {
        name: 'EVENTS_BUS',
        inject: [ConfigService],
        useFactory: (config: Cfg): RmqOptions =>
          rmqClientOptions(QUEUES.ordersEvents, get(config, 'RABBITMQ_URL')),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [
    {
      provide: 'DB',
      inject: [ConfigService],
      useFactory: (config: Cfg): Db => createDb(get(config, 'DATABASE_URL')),
    },
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: Cfg) => new Redis(get(config, 'REDIS_URL')),
    },
    {
      provide: RedisService,
      inject: [REDIS_CLIENT],
      useFactory: (r: Redis) => new RedisService(r),
    },
    { provide: OutboxRepository, useFactory: () => new OutboxRepository() },
    {
      provide: 'RELEASE_QUEUE',
      inject: [ConfigService],
      useFactory: (config: Cfg) =>
        new Queue('orders.release', { connection: bullConnection(get(config, 'REDIS_URL')) }),
    },
    {
      provide: OrdersService,
      inject: ['DB', RedisService, OutboxRepository, 'RELEASE_QUEUE', ConfigService],
      useFactory: (
        db: Db,
        redis: RedisService,
        outbox: OutboxRepository,
        queue: Queue,
        config: Cfg,
      ) => new OrdersService(db, redis, outbox, queue, get(config, 'RESERVATION_TTL_SEC')),
    },
    {
      provide: OutboxPoller,
      inject: ['DB', 'EVENTS_BUS'],
      useFactory: (db: Db, client: ClientProxy) => new OutboxPoller(db, ordersOutbox, client),
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
