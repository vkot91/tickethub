import { Injectable } from '@nestjs/common';
import { and, inArray, isNotNull, sql } from 'drizzle-orm';
import { tickets, type Db } from '@tickethub/db';

/**
 * The console's read surface on Fulfillment. `showIds` arrives resolved by the gateway — nothing
 * here checks ownership, and an empty list is zero rather than "every show on the platform".
 */
@Injectable()
export class OrganizerStatsService {
  constructor(private readonly db: Db) {}

  async checkedInCount(showIds: string[]): Promise<number> {
    if (showIds.length === 0) return 0;

    const [counted] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(inArray(tickets.showId, showIds), isNotNull(tickets.checkedInAt)));

    return counted.count;
  }
}
