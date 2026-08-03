import { ordersProcessedMessages } from '@tickethub/db';
import { getTestDb } from '@tickethub/db/testing';

import { InboxRepository } from './inbox.repository';

const inbox = new InboxRepository(ordersProcessedMessages);

describe('InboxRepository', () => {
  it('reports a message as unprocessed the first time and processed after that', async () => {
    const db = await getTestDb();
    const messageId = crypto.randomUUID();

    const first = await db.transaction((tx) => inbox.alreadyProcessed(tx, messageId));
    const second = await db.transaction((tx) => inbox.alreadyProcessed(tx, messageId));

    expect(first).toBe(false);
    expect(second).toBe(true);
  });

  it('tracks message ids independently', async () => {
    const db = await getTestDb();
    const seen = crypto.randomUUID();
    const fresh = crypto.randomUUID();

    await db.transaction((tx) => inbox.alreadyProcessed(tx, seen));

    expect(await db.transaction((tx) => inbox.alreadyProcessed(tx, fresh))).toBe(false);
  });

  it('forgets the claim when the caller transaction rolls back', async () => {
    const db = await getTestDb();
    const messageId = crypto.randomUUID();

    // The claim shares the caller's transaction on purpose — otherwise a handler that
    // failed mid-way would leave the message marked done and its effect never applied.
    await expect(
      db.transaction(async (tx) => {
        await inbox.alreadyProcessed(tx, messageId);
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');

    expect(await db.transaction((tx) => inbox.alreadyProcessed(tx, messageId))).toBe(false);
  });
});
