import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { organizers, type Db } from '@tickethub/db';

/** The organizer profile itself — the row every venue, show and ticket type hangs off. */
@Injectable()
export class OrganizerService {
  constructor(private readonly db: Db) {}

  /**
   * Creates the organizer profile an auth user's shows will hang off. The role check already
   * happened at the gateway; this only writes the shows-side row.
   *
   * Creating twice is not an error — it returns the existing id, so the caller can retry a failed
   * become-organizer without a 409. `onConflictDoNothing` + re-select is also what makes two
   * concurrent calls settle on one row; `organizers.user_id` is UNIQUE.
   */
  async create(userId: string, name: string): Promise<string> {
    const [created] = await this.db
      .insert(organizers)
      .values({ userId, name })
      .onConflictDoNothing({ target: organizers.userId })
      .returning({ id: organizers.id });

    if (created) return created.id;

    const [existing] = await this.db
      .select({ id: organizers.id })
      .from(organizers)
      .where(eq(organizers.userId, userId))
      .limit(1);

    return existing.id;
  }
}
