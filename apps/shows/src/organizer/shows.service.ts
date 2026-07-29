import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { organizers, shows, type Db } from '@tickethub/db';

/**
 * An organizer's own shows — every status, no publication filter, always scoped to the caller.
 * The buyer-facing catalog reads live in `user/shows.service.ts` and share nothing but the db.
 */
@Injectable()
export class OrganizerShowsService {
  constructor(private readonly db: Db) {}

  /**
   * The single mechanism by which orders, fulfillment and the gateway fan-outs learn what an
   * organizer owns. Empty for a user who has never authored anything.
   */
  async showIds(userId: string): Promise<string[]> {
    const owned = await this.db
      .select({ id: shows.id })
      .from(shows)
      .innerJoin(organizers, eq(organizers.id, shows.organizerId))
      .where(eq(organizers.userId, userId));

    return owned.map((show) => show.id);
  }
}
