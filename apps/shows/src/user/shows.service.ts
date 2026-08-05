import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, ne } from 'drizzle-orm';
import {
  shows,
  sections,
  rows,
  seats,
  ticketTypes,
  showSectionPricing,
  type Db,
} from '@tickethub/db';
import type { CatalogQuery, ShowSummary, ShowDetail, SeatMap } from '@tickethub/contracts';

/**
 * A permalink resolves anything that ever went public — `published`, `cancelled`, `finished` —
 * and hides only `draft`. Deliberately *not* `catalog()`'s `published` filter: that is a browse
 * surface listing what is on sale, while these are permalinks, and `apps/fulfillment` reads the
 * title and start time back through them for tickets to shows that have since been cancelled.
 * Narrowing this to `published` silently renders those as 'Unavailable show'.
 *
 * A draft is a 404, never a 403 — a 403 confirms the id is real.
 */
const publicShow = (id: string) => and(eq(shows.id, id), ne(shows.status, 'draft'));

@Injectable()
export class UserShowsService {
  constructor(private readonly db: Db) {}

  async catalog(q: CatalogQuery): Promise<{ items: ShowSummary[]; nextCursor: string | null }> {
    const where = q.cursor
      ? and(eq(shows.status, 'published'), gt(shows.id, q.cursor))
      : eq(shows.status, 'published');
    const rowsOut = await this.db
      .select({
        id: shows.id,
        title: shows.title,
        startsAt: shows.startsAt,
        posterUrl: shows.posterUrl,
        status: shows.status,
      })
      .from(shows)
      .where(where)
      .orderBy(asc(shows.id))
      .limit(q.limit + 1);

    const items = rowsOut
      .slice(0, q.limit)
      .map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })) as ShowSummary[];
    const nextCursor = rowsOut.length > q.limit ? rowsOut[q.limit].id : null;
    return { items, nextCursor };
  }

  async detail(id: string): Promise<ShowDetail> {
    const [e] = await this.db.select().from(shows).where(publicShow(id)).limit(1);
    if (!e) throw new NotFoundException('Show not found');

    // Only bands that actually price a section: a ticket type mapped to nothing sells no seat,
    // so advertising it would quote the buyer a price the seat map can never offer. The join
    // makes it one row per band however many sections it covers.
    const priceTiers = await this.db
      .selectDistinct({
        id: ticketTypes.id,
        tier: ticketTypes.tier,
        name: ticketTypes.name,
        priceCents: ticketTypes.priceCents,
        currency: ticketTypes.currency,
      })
      .from(ticketTypes)
      .innerJoin(showSectionPricing, eq(showSectionPricing.ticketTypeId, ticketTypes.id))
      .where(eq(ticketTypes.showId, id))
      .orderBy(desc(ticketTypes.priceCents), asc(ticketTypes.id));

    return {
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt.toISOString(),
      posterUrl: e.posterUrl,
      status: e.status,
      venueId: e.venueId,
      priceTiers,
    };
  }

  async seatMap(id: string): Promise<SeatMap> {
    const [e] = await this.db.select().from(shows).where(publicShow(id)).limit(1);
    if (!e) throw new NotFoundException('Show not found');

    // `show_section_pricing` is the entry point, not the venue's section list: it names exactly the
    // sections this show put on sale and the ticket type pricing each, so every seat below
    // carries a real ticketTypeId — which is what createOrder demands per seat. A section the
    // show does not sell simply never joins in.
    const priced = await this.db
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        rowId: rows.id,
        rowNumber: rows.number,
        seatId: seats.id,
        seatNumber: seats.number,
        ticketTypeId: ticketTypes.id,
        priceCents: ticketTypes.priceCents,
        tier: ticketTypes.tier,
      })
      .from(showSectionPricing)
      .innerJoin(sections, eq(showSectionPricing.sectionId, sections.id))
      .innerJoin(ticketTypes, eq(showSectionPricing.ticketTypeId, ticketTypes.id))
      .innerJoin(rows, eq(rows.sectionId, sections.id))
      .innerJoin(seats, eq(seats.rowId, rows.id))
      .where(eq(showSectionPricing.showId, id))
      .orderBy(asc(sections.name), asc(rows.number), asc(seats.number));

    // One pass over the flat join, relying on the ORDER BY to keep each section's and row's
    // seats contiguous — the map is built by appending to whatever group is currently open.
    const built: SeatMap['sections'] = [];
    for (const seat of priced) {
      let section = built.at(-1);
      if (section?.id !== seat.sectionId) {
        section = { id: seat.sectionId, name: seat.sectionName, rows: [] };
        built.push(section);
      }

      let row = section.rows.at(-1);
      if (row?.id !== seat.rowId) {
        row = { id: seat.rowId, number: seat.rowNumber, seats: [] };
        section.rows.push(row);
      }

      row.seats.push({
        id: seat.seatId,
        number: seat.seatNumber,
        ticketTypeId: seat.ticketTypeId,
        priceCents: seat.priceCents,
        tier: seat.tier,
      });
    }

    return { showId: id, sections: built };
  }
}
