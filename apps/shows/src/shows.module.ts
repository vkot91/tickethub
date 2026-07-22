import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { createDb, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { rmqConfig } from '@tickethub/rmq';
import { ShowsController } from './shows.controller';
import { ShowsService } from './shows.service';
import { schema, type Config } from './config';

@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    RabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Config, true>) =>
        rmqConfig(config.get('RABBITMQ_URL', { infer: true }), true),
    }),
  ],
  controllers: [ShowsController],
  providers: [
    {
      provide: 'DB',
      inject: [ConfigService],
      useFactory: (config: ConfigService<Config, true>): Db =>
        createDb(config.get('DATABASE_URL', { infer: true })),
    },
    { provide: ShowsService, inject: ['DB'], useFactory: (db) => new ShowsService(db) },
  ],
})
export class ShowsModule {}
