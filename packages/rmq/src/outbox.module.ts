import { DynamicModule, Module } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { OutboxRepository, InboxRepository, OutboxPoller } from '@tickethub/outbox';
import type { Db, OutboxTable, ProcessedMessagesTable } from '@tickethub/db';
import { publishStored } from './rmq.config';

// The outbox integration lives here, in the transport package, because wiring the poller
// couples it to AmqpConnection + publishStored. @tickethub/outbox itself stays transport-agnostic
// (its poller takes a plain PublishFn). Needs a global 'DB' provider — see DbModule.forRoot().
@Module({})
export class OutboxModule {
  static forFeature(tables: {
    outbox: OutboxTable;
    processed: ProcessedMessagesTable;
  }): DynamicModule {
    return {
      module: OutboxModule,
      providers: [
        {
          provide: OutboxRepository,
          inject: ['DB'],
          useFactory: (db: Db) => new OutboxRepository(db, tables.outbox),
        },
        {
          provide: InboxRepository,
          useFactory: () => new InboxRepository(tables.processed),
        },
        {
          provide: OutboxPoller,
          inject: [OutboxRepository, AmqpConnection],
          useFactory: (outbox: OutboxRepository, amqp: AmqpConnection) =>
            new OutboxPoller(outbox, (routingKey, payload) =>
              publishStored(amqp, routingKey, payload),
            ),
        },
      ],
      exports: [OutboxRepository, InboxRepository, OutboxPoller],
    };
  }
}
