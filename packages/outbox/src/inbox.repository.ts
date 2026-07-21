import type { ProcessedMessagesTable } from '@tickethub/db';
import type { Tx } from './outbox.repository';

// The consumer half of the messaging pattern: outbox delivery is at-least-once, so every
// handler must be able to recognise a message it has already applied.
//
// No `db` here on purpose — the claim only means anything inside the caller's transaction,
// alongside the domain write it guards. This repository never opens one of its own.
export class InboxRepository {
  constructor(private readonly table: ProcessedMessagesTable) {}

  // Insert the messageId; a PK conflict (0 rows returned) means we've already processed it.
  async alreadyProcessed(tx: Tx, messageId: string): Promise<boolean> {
    const rows = await tx
      .insert(this.table)
      .values({ messageId })
      .onConflictDoNothing()
      .returning();

    return rows.length === 0;
  }
}
