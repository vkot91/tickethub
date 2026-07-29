import { Module } from '@nestjs/common';
import { showsOutbox, showsProcessedMessages } from '@tickethub/db';
import { DbModule } from '@tickethub/db/nest';
import { configModuleFor } from '@tickethub/config';
import { AppLoggerModule } from '@tickethub/common';
import { rmqRootModule, OutboxModule } from '@tickethub/rmq';
import { OutboxRepository } from '@tickethub/outbox';
import { StorageClient, StorageModule } from '@tickethub/storage';
import { UserShowsController } from './user/shows.controller';
import { UserShowsService } from './user/shows.service';
import { OrganizerController } from './organizer/organizer.controller';
import { OrganizerService } from './organizer/organizer.service';
import { OrganizerShowsController } from './organizer/shows.controller';
import { OrganizerShowsService } from './organizer/shows.service';
import { OrganizerPublishingService } from './organizer/publishing.service';
import { OrganizerPosterService } from './organizer/poster.service';
import { OrganizerVenuesController } from './organizer/venues.controller';
import { OrganizerVenuesService } from './organizer/venues.service';
import { schema } from './config';

// One provider per service, each handed the same 'DB' connection — the audience split is a
// code-layout rule, not a data one; both halves read the same `shows` schema.
@Module({
  imports: [
    configModuleFor(schema),
    AppLoggerModule,
    DbModule.forRoot(),
    OutboxModule.forFeature({ outbox: showsOutbox, processed: showsProcessedMessages }),
    rmqRootModule(),
    StorageModule.forBucket('S3_BUCKET_POSTERS'),
  ],
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
      provide: OrganizerPublishingService,
      inject: ['DB', OutboxRepository],
      useFactory: (db, outbox) => new OrganizerPublishingService(db, outbox),
    },
    {
      provide: OrganizerShowsService,
      inject: ['DB', OrganizerPublishingService],
      useFactory: (db, publishing) => new OrganizerShowsService(db, publishing),
    },
    {
      provide: OrganizerPosterService,
      inject: ['DB', StorageClient],
      useFactory: (db, storage) => new OrganizerPosterService(db, storage),
    },
    {
      provide: OrganizerVenuesService,
      inject: ['DB'],
      useFactory: (db) => new OrganizerVenuesService(db),
    },
  ],
})
export class ShowsModule {}
