import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClientsModule, Transport, type RmqOptions } from '@nestjs/microservices';
import { TerminusModule } from '@nestjs/terminus';
import { RedisModule } from '@tickethub/redis';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RequestIdMiddleware, RequestIdSerializer } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
import { RPC } from './tokens';
import { GatewayAuthController } from './auth/auth.controller';
import { GatewayEventsController } from './events/events.controller';
import { HealthController } from './health/health.controller';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { schema, type Config } from './config';

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
    ]),
  ],
  controllers: [GatewayAuthController, GatewayEventsController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule implements NestModule {
  // Seed the correlation id at the edge, for every route, before the handlers run.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
