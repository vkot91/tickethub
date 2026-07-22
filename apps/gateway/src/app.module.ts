import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { RedisModule } from '@tickethub/redis';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RequestIdMiddleware, rmqConfig } from '@tickethub/rmq';
import { GatewayAuthController } from './auth/auth.controller';
import { GatewayShowsController } from './shows/shows.controller';
import { GatewayOrdersController } from './orders/orders.controller';
import { GatewayPaymentsController } from './payments/payments.controller';
import { HealthController } from './health/health.controller';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { schema, type Config } from './config';

// The delayed-release queue owned by the orders service (apps/orders); we attach read/monitor
// access here so bull-board can inspect it. BullMQ wants a discrete host/port, not a URL.
const RELEASE_QUEUE = 'orders.release';

const bullConnection = (redisUrl: string) => {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: Number(url.port || 6379) };
};

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
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Config, true>) =>
        rmqConfig(config.get('RABBITMQ_URL', { infer: true })),
    }),
    ...queueDashboardImports,
  ],
  controllers: [
    GatewayAuthController,
    GatewayShowsController,
    GatewayOrdersController,
    GatewayPaymentsController,
    HealthController,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule implements NestModule {
  // Seed the correlation id at the edge, for every route, before the handlers run.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
