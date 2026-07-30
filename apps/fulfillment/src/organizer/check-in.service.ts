import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { tickets, type Db } from '@tickethub/db';
import type { CheckInScan } from '@tickethub/contracts';
import { verifyTicketToken } from '../tickets/qr';

/**
 * The gate. `showId` arrives already proved to belong to the caller — nothing here checks
 * ownership — and it is **one** show: the door the attendant is standing at. A scan scoped to every
 * show an organizer owns would admit next week's ticket tonight and burn it.
 */
@Injectable()
export class OrganizerCheckInService {
  constructor(
    private readonly db: Db,
    private readonly qrSecret: string,
  ) {}

  async checkIn(code: string, showId: string): Promise<CheckInScan> {
    // A forged token is rejected in constant time, before the database is involved. Not required
    // for correctness — the token is looked up by exact match, so a forgery simply misses — but it
    // turns a round-trip into a string comparison.
    if (!verifyTicketToken(code, this.qrSecret)) return this.rejected('invalid', showId);

    // One conditional statement *is* the concurrency control: two simultaneous scans of the same
    // ticket contend on the row, and exactly one of them updates it. A read-then-write here would
    // admit the same seat twice under precisely the load a gate produces.
    const [admitted] = await this.db
      .update(tickets)
      .set({ checkedInAt: new Date() })
      .where(
        and(eq(tickets.qrToken, code), eq(tickets.showId, showId), isNull(tickets.checkedInAt)),
      )
      .returning({ seatLabel: tickets.seatLabel, checkedInAt: tickets.checkedInAt });

    if (admitted) return this.admitted('valid', admitted, showId);

    // No row updated means one of three different things, and only a second read can tell them
    // apart: no such ticket, a ticket for another show, or one already through this gate.
    const [existing] = await this.db
      .select({
        seatLabel: tickets.seatLabel,
        showId: tickets.showId,
        checkedInAt: tickets.checkedInAt,
      })
      .from(tickets)
      .where(eq(tickets.qrToken, code))
      .limit(1);

    if (!existing) return this.rejected('invalid', showId);

    // Real ticket, wrong door — whether it belongs to a rival or to this organizer's other show.
    // Nothing about the show it *is* for comes back, so the two are indistinguishable from here.
    if (existing.showId !== showId) return this.rejected('wrongShow', showId);

    return this.admitted('used', existing, showId);
  }

  /** No ticket resolved, so no label and no timestamp — but the gate's counter still stands. */
  private async rejected(result: 'invalid' | 'wrongShow', showId: string): Promise<CheckInScan> {
    return {
      result,
      seatLabel: null,
      checkedInAt: null,
      checkedInCount: await this.checkedInCount(showId),
    };
  }

  private async admitted(
    result: 'valid' | 'used',
    row: { seatLabel: string; checkedInAt: Date | null },
    showId: string,
  ): Promise<CheckInScan> {
    return {
      result,
      seatLabel: row.seatLabel,
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
      checkedInCount: await this.checkedInCount(showId),
    };
  }

  /** How many seats are through **this** gate — never the scanned ticket's own show. */
  private async checkedInCount(showId: string): Promise<number> {
    const [counted] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(eq(tickets.showId, showId), isNotNull(tickets.checkedInAt)));

    return counted.count;
  }
}
