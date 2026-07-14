import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport, type RmqOptions } from '@nestjs/microservices';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { RedisModule } from '@tickethub/redis';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RequestIdMiddleware, RequestIdSerializer, rmqClientOptions } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
import { RPC } from './tokens';
import { GatewayAuthController } from './auth/auth.controller';
import { GatewayEventsController } from './events/events.controller';
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

const rpcClient = (name: string, queue: string) => ({
  name,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Config, true>): RmqOptions => {
    const urls: string[] = [config.get('RABBITMQ_URL', { infer: true })];
    return {
      transport: Transport.RMQ,
      options: {
        urls,
        queue,
        queueOptions: { durable: true },
        serializer: new RequestIdSerializer(),
      },
    };
  },
});

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    TerminusModule,
    RedisModule,
    ClientsModule.registerAsync([
      rpcClient(RPC.auth, QUEUES.authRpc),
      rpcClient(RPC.events, QUEUES.eventsRpc),
      // Orders declares its queue with a DLX (see rmqClientOptions); the client must
      // pass identical queueOptions or RabbitMQ rejects the second declaration.
      {
        name: RPC.orders,
        inject: [ConfigService],
        useFactory: (config: ConfigService<Config, true>): RmqOptions =>
          rmqClientOptions(QUEUES.ordersRpc, config.get('RABBITMQ_URL', { infer: true })),
      },
      // Payments declares payments.rpc with a DLX too; match its queueOptions.
      {
        name: RPC.payments,
        inject: [ConfigService],
        useFactory: (config: ConfigService<Config, true>): RmqOptions =>
          rmqClientOptions(QUEUES.paymentsRpc, config.get('RABBITMQ_URL', { infer: true })),
      },
    ]),
    ...queueDashboardImports,
  ],
  controllers: [
    GatewayAuthController,
    GatewayEventsController,
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
