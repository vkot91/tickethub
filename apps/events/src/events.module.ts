import { Module } from '@nestjs/common';
import { createDb, type Db } from '@tickethub/db';
import { configModuleFor, ConfigService } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { schema, type Config } from './config';

@Module({
  imports: [configModuleFor(schema), AppLoggerModule],
  controllers: [EventsController],
  providers: [
    {
      provide: 'DB',
      inject: [ConfigService],
      useFactory: (config: ConfigService<Config, true>): Db =>
        createDb(config.get('DATABASE_URL', { infer: true })),
    },
    { provide: EventsService, inject: ['DB'], useFactory: (db) => new EventsService(db) },
  ],
})
export class EventsModule {}
