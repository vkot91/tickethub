import { Module } from '@nestjs/common';
import { ClientsModule, Transport, type RmqOptions } from '@nestjs/microservices';
import Redis from 'ioredis';
import { createDb, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { RequestIdSerializer } from '@tickethub/rmq';
import { QUEUES } from '@tickethub/contracts';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { schema, type Config } from './config';

type Cfg = ConfigService<Config, true>;

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    ClientsModule.registerAsync([
      {
        name: 'EVENTS_BUS',
        inject: [ConfigService],
        useFactory: (config: Cfg): RmqOptions => {
          const urls: string[] = [config.get('RABBITMQ_URL', { infer: true })];
          return {
            transport: Transport.RMQ,
            options: {
              urls,
              queue: QUEUES.authEvents,
              queueOptions: { durable: true },
              serializer: new RequestIdSerializer(),
            },
          };
        },
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'DB',
      inject: [ConfigService],
      useFactory: (config: Cfg): Db => createDb(config.get('DATABASE_URL', { infer: true })),
    },
    {
      provide: 'REDIS',
      inject: [ConfigService],
      useFactory: (config: Cfg) => new Redis(config.get('REDIS_URL', { infer: true })),
    },
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
      inject: ['DB', 'REDIS', JwtService, 'EVENTS_BUS'],
      useFactory: (db, redis, jwt, client) => new AuthService(db, redis, jwt, client),
    },
  ],
})
export class AuthModule {}
