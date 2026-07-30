import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { RedisModule, bullConnection } from '@tickethub/redis';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RequestIdMiddleware, rmqRootModule } from '@tickethub/rmq';
import { GatewayAuthController } from './auth/auth.controller';
import { GatewayUserShowsController } from './user/shows.controller';
import { GatewayUserOrdersController } from './user/orders.controller';
import { GatewayUserPaymentsController } from './user/payments.controller';
import { GatewayUserTicketsController } from './user/tickets.controller';
import { ShowContextService } from './shared/show-context.service';
import { HealthController } from './health/health.controller';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { schema, type Config } from './config';
import { OrganizerShowsService } from './organizer/shows.service';
import { GatewayOrganizerVenuesController } from './organizer/venues.controller';
import { GatewayOrganizerShowsController } from './organizer/shows.controller';
import { GatewayOrganizerStatsController } from './organizer/stats.controller';
import { OrganizerStatsService } from './organizer/stats.service';
import { GatewayOrganizerCheckInController } from './organizer/check-in.controller';
import { OrganizerCheckInService } from './organizer/check-in.service';

// The delayed-release queue owned by the orders service (apps/orders); we attach read/monitor
// access here so bull-board can inspect it.
const RELEASE_QUEUE = 'orders.release';

// bull-board exposes queue contents and mutation (retry/remove); keep it out of production
// until it sits behind admin auth. ponytail: dev-only gate; add a guard before exposing it.
const queueDashboardImports =
  process.env.NODE_ENV === 'production'
    ? []
    : [
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService<Config, true>) => ({
            connection: bullConnection(config.get('REDIS_URL', { infer: true })),
          }),
        }),
        BullModule.registerQueue({ name: RELEASE_QUEUE }),
        BullBoardModule.forRoot({ route: '/admin/queues', adapter: ExpressAdapter }),
        BullBoardModule.forFeature({ name: RELEASE_QUEUE, adapter: BullMQAdapter }),
      ];

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    TerminusModule,
    RedisModule,
    // One AmqpConnection for the whole gateway; every controller RPCs over it via rpcRequest.
    // wait:false — the gateway stays alive via app.listen() and boots even if the broker is down.
    rmqRootModule(false),
    ...queueDashboardImports,
  ],
  controllers: [
    GatewayAuthController,
    GatewayUserShowsController,
    GatewayUserOrdersController,
    GatewayUserPaymentsController,
    GatewayUserTicketsController,
    GatewayOrganizerVenuesController,
    GatewayOrganizerShowsController,
    GatewayOrganizerStatsController,
    GatewayOrganizerCheckInController,
    HealthController,
  ],
  // No UserModule/OrganizerModule: Nest cannot scope a guard to a module (only APP_GUARD, which
  // is global), so a module per audience would be grouping for its own sake. The folders group.
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    ShowContextService,
    OrganizerShowsService,
    OrganizerStatsService,
    OrganizerCheckInService,
  ],
})
export class AppModule implements NestModule {
  // Seed the correlation id at the edge, for every route, before the handlers run.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
