import { pgSchema } from 'drizzle-orm/pg-core';

import { createOutboxTable, createProcessedMessagesTable } from './outbox';

describe('outbox factories', () => {
  const s = pgSchema('demo');

  it('builds an outbox table with the expected columns', () => {
    const t = createOutboxTable(s);
    expect(Object.keys(t)).toEqual(
      expect.arrayContaining(['id', 'routingKey', 'payload', 'createdAt', 'publishedAt']),
    );
  });

  it('builds a processed_messages table keyed by messageId', () => {
    const t = createProcessedMessagesTable(s);
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['messageId', 'processedAt']));
  });
});
