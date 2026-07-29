import { Module } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ordersOutbox, ordersProcessedMessages } from '@tickethub/db';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RedisModule, bullConnection } from '@tickethub/redis';
import { rmqRootModule, OutboxModule } from '@tickethub/rmq';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderSagaController } from './saga/saga.controller';
import { OrderSagaService } from './saga/saga.service';
import { OrderRepository } from './orders.repository';
import { OrganizerStatsController } from './organizer/stats.controller';
import { OrganizerStatsService } from './organizer/stats.service';
import { startReleaseWorker } from './release/release.worker';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;
const get = <K extends keyof Config>(c: Cfg, k: K) => c.get(k, { infer: true });

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    RedisModule,
    DbModule.forRoot(),
    OutboxModule.forFeature({ outbox: ordersOutbox, processed: ordersProcessedMessages }),
    rmqRootModule(),
  ],
  controllers: [OrdersController, OrderSagaController, OrganizerStatsController],
  providers: [
    // Everything the services can't reach by class token: the queue and the TTL.
    {
      provide: 'RELEASE_QUEUE',
      inject: [ConfigService],
      useFactory: (config: Cfg) =>
        new Queue('orders.release', { connection: bullConnection(get(config, 'REDIS_URL')) }),
    },
    {
      provide: 'RESERVATION_TTL_SEC',
      inject: [ConfigService],
      useFactory: (config: Cfg) => get(config, 'RESERVATION_TTL_SEC'),
    },
    OrderRepository,
    OrdersService,
    OrderSagaService,
    OrganizerStatsService,
    {
      provide: 'RELEASE_WORKER',
      inject: [OrderSagaService, ConfigService],
      useFactory: (sagaService: OrderSagaService, config: Cfg) =>
        startReleaseWorker(sagaService, bullConnection(get(config, 'REDIS_URL'))),
    },
  ],
})
export class OrdersModule {}
