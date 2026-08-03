import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { FactoryProvider } from '@nestjs/common';

import type { Db, OutboxTable, ProcessedMessagesTable } from '@tickethub/db';
import { InboxRepository, OutboxPoller, OutboxRepository } from '@tickethub/outbox';

import { OutboxModule } from './outbox.module';

describe('OutboxModule.forFeature', () => {
  const def = OutboxModule.forFeature({
    outbox: {} as OutboxTable,
    processed: {} as ProcessedMessagesTable,
  });
  const providers = def.providers as FactoryProvider[];
  const providerFor = (token: unknown) => providers.find((p) => p.provide === token)!;

  it('wires the outbox repository against the DB token', () => {
    const provider = providerFor(OutboxRepository);

    expect(provider.inject).toEqual(['DB']);
    expect(provider.useFactory({} as Db)).toBeInstanceOf(OutboxRepository);
  });

  it('wires the inbox repository', () => {
    expect(providerFor(InboxRepository).useFactory()).toBeInstanceOf(InboxRepository);
  });

  it('wires the poller with the amqp publisher', () => {
    const provider = providerFor(OutboxPoller);

    expect(provider.inject).toEqual([OutboxRepository, AmqpConnection]);
    const poller = provider.useFactory({} as OutboxRepository, {} as AmqpConnection);
    expect(poller).toBeInstanceOf(OutboxPoller);
  });

  it('exports all three providers', () => {
    expect(def.exports).toEqual([OutboxRepository, InboxRepository, OutboxPoller]);
  });
});
