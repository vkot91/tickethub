import { Module } from '@nestjs/common';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { rmqRootModule } from '@tickethub/rmq';
import { ShowsController } from './shows.controller';
import { ShowsService } from './shows.service';
import { schema } from './config';

@Module({
  imports: [configModuleFor(schema), AppLoggerModule, DbModule.forRoot(), rmqRootModule()],
  controllers: [ShowsController],
  providers: [{ provide: ShowsService, inject: ['DB'], useFactory: (db) => new ShowsService(db) }],
})
export class ShowsModule {}
