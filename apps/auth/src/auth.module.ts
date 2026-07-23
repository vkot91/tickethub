import { Module } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import type Redis from 'ioredis';
import type { Db } from '@tickethub/db';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RedisModule, REDIS_CLIENT } from '@tickethub/redis';
import { rmqRootModule } from '@tickethub/rmq';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    RedisModule,
    DbModule.forRoot(),
    rmqRootModule(),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: JwtService,
      inject: [ConfigService],
      useFactory: (config: Cfg) =>
        new JwtService({
          accessSecret: config.get('JWT_ACCESS_SECRET', { infer: true }),
          refreshSecret: config.get('JWT_REFRESH_SECRET', { infer: true }),
        }),
    },
    {
      provide: AuthService,
      inject: ['DB', REDIS_CLIENT, JwtService, AmqpConnection],
      useFactory: (db: Db, redis: Redis, jwt: JwtService, amqp: AmqpConnection) =>
        new AuthService(db, redis, jwt, amqp),
    },
  ],
})
export class AuthModule {}
