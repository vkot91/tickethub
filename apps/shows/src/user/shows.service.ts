import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, ne } from 'drizzle-orm';
import {
  shows,
  sections,
  rows,
  seats,
  priceBands,
  showSectionPricing,
  type Db,
} from '@tickethub/db';
import type { CatalogQuery, ShowSummary, ShowDetail, SeatMap } from '@tickethub/contracts';

/**
 * A permalink resolves anything that ever went public — `published`, `cancelled`, `finished` —
 * and hides only `draft`. Deliberately *not* `catalog()`'s `published` filter: that is a browse
 * surface listing what is on sale, while these are permalinks, and `apps/tickets` reads the
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

    // Only bands that actually price a section: a price band mapped to nothing sells no seat,
    // so advertising it would quote the buyer a price the seat map can never offer. The join
    // makes it one row per band however many sections it covers.
    const priceTiers = await this.db
      .selectDistinct({
        id: priceBands.id,
        tier: priceBands.tier,
        name: priceBands.name,
        priceCents: priceBands.priceCents,
        currency: priceBands.currency,
      })
      .from(priceBands)
      .innerJoin(showSectionPricing, eq(showSectionPricing.bandId, priceBands.id))
      .where(eq(priceBands.showId, id))
      .orderBy(desc(priceBands.priceCents), asc(priceBands.id));

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
    // sections this show put on sale and the price band pricing each, so every seat below
    // carries a real bandId — which is what createOrder demands per seat. A section the
    // show does not sell simply never joins in.
    const priced = await this.db
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        rowId: rows.id,
        rowNumber: rows.number,
        seatId: seats.id,
        seatNumber: seats.number,
        bandId: priceBands.id,
        priceCents: priceBands.priceCents,
        tier: priceBands.tier,
      })
      .from(showSectionPricing)
      .innerJoin(sections, eq(showSectionPricing.sectionId, sections.id))
      .innerJoin(priceBands, eq(showSectionPricing.bandId, priceBands.id))
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
        bandId: seat.bandId,
        priceCents: seat.priceCents,
        tier: seat.tier,
      });
    }

    return { showId: id, sections: built };
  }
}
