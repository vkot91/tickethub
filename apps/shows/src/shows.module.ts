import { Module } from '@nestjs/common';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { rmqRootModule } from '@tickethub/rmq';
import { UserShowsController } from './user/shows.controller';
import { UserShowsService } from './user/shows.service';
import { OrganizerController } from './organizer/organizer.controller';
import { OrganizerService } from './organizer/organizer.service';
import { OrganizerShowsController } from './organizer/shows.controller';
import { OrganizerShowsService } from './organizer/shows.service';
import { OrganizerVenuesController } from './organizer/venues.controller';
import { OrganizerVenuesService } from './organizer/venues.service';
import { schema } from './config';

// One provider per service, each handed the same 'DB' connection — the audience split is a
// code-layout rule, not a data one; both halves read the same `shows` schema.
@Module({
  imports: [configModuleFor(schema), AppLoggerModule, DbModule.forRoot(), rmqRootModule()],
  controllers: [
    UserShowsController,
    OrganizerController,
    OrganizerShowsController,
    OrganizerVenuesController,
  ],
  providers: [
    { provide: UserShowsService, inject: ['DB'], useFactory: (db) => new UserShowsService(db) },
    { provide: OrganizerService, inject: ['DB'], useFactory: (db) => new OrganizerService(db) },
    {
      provide: OrganizerShowsService,
      inject: ['DB'],
      useFactory: (db) => new OrganizerShowsService(db),
    },
    {
      provide: OrganizerVenuesService,
      inject: ['DB'],
      useFactory: (db) => new OrganizerVenuesService(db),
    },
  ],
})
export class ShowsModule {}
