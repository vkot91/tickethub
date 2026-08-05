import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { tickets, type Db } from '@tickethub/db';
import type { CheckInScan } from '@tickethub/contracts';
import { parseDisplayCode, verifyTicketToken } from '../tickets/qr';

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

  async checkIn(input: string, showId: string): Promise<CheckInScan> {
    // A forged token is rejected in constant time, before the database is involved. Not required
    // for correctness — the token is looked up by exact match, so a forgery simply misses — but it
    // turns a round-trip into a string comparison.
    //
    // What is not a token may still be the code printed on the ticket, typed in because the camera
    // would not read. That is resolved to a real token first, so everything below this line is the
    // one admission path — a manual entry is not a second, weaker gate.
    const code = verifyTicketToken(input, this.qrSecret)
      ? input
      : await this.tokenForDisplayCode(input, showId);

    if (!code) return this.rejected('invalid', showId);

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

  /**
   * The token behind a printed `TH-…` code, or `null` if the string is not one, names no ticket at
   * this gate, or names more than one.
   *
   * Scoped to `showId` on purpose: the code is unsigned, so it is never allowed to reach a ticket
   * the attendant is not already standing in front of. A code for another show therefore comes
   * back `invalid` rather than `wrongShow` — the QR keeps that distinction, an unsigned string
   * does not earn it.
   *
   * ponytail: `left(id::text, 8)` scans the show's tickets — a few thousand rows on the manual
   * path only. An expression index on `(show_id, left(id::text, 8))` if a gate ever feels it.
   */
  private async tokenForDisplayCode(input: string, showId: string): Promise<string | null> {
    const prefix = parseDisplayCode(input);

    if (!prefix) return null;

    // Two rows is not a tie to break: eight hex characters are not unique, and admitting either
    // one burns a seat at random. `limit(2)` is the whole ambiguity check.
    const matches = await this.db
      .select({ qrToken: tickets.qrToken })
      .from(tickets)
      .where(and(eq(tickets.showId, showId), sql`left(${tickets.id}::text, 8) = ${prefix}`))
      .limit(2);

    return matches.length === 1 ? matches[0].qrToken : null;
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
