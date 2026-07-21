import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { shows, sections, rows, seats, type Db } from '@tickethub/db';
import type { CatalogQuery, ShowSummary, ShowDetail, SeatMap } from '@tickethub/contracts';

@Injectable()
export class ShowsService {
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
      .map((e) => ({ ...e, startsAt: String(e.startsAt) })) as ShowSummary[];
    const nextCursor = rowsOut.length > q.limit ? rowsOut[q.limit].id : null;
    return { items, nextCursor };
  }

  async detail(id: string): Promise<ShowDetail> {
    const [e] = await this.db.select().from(shows).where(eq(shows.id, id)).limit(1);
    if (!e) throw new NotFoundException('Show not found');
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      startsAt: String(e.startsAt),
      posterUrl: e.posterUrl,
      status: e.status,
      venueId: e.venueId,
    };
  }

  async seatMap(id: string): Promise<SeatMap> {
    const [e] = await this.db.select().from(shows).where(eq(shows.id, id)).limit(1);
    if (!e) throw new NotFoundException('Show not found');
    const secs = await this.db.select().from(sections).where(eq(sections.venueId, e.venueId));
    const built = await Promise.all(
      secs.map(async (sec) => {
        const rws = await this.db
          .select()
          .from(rows)
          .where(eq(rows.sectionId, sec.id))
          .orderBy(asc(rows.number));
        const rowsWithSeats = await Promise.all(
          rws.map(async (rw) => ({
            id: rw.id,
            number: rw.number,
            seats: await this.db
              .select({ id: seats.id, number: seats.number })
              .from(seats)
              .where(eq(seats.rowId, rw.id))
              .orderBy(asc(seats.number)),
          })),
        );
        return { id: sec.id, name: sec.name, rows: rowsWithSeats };
      }),
    );
    return { showId: id, sections: built };
  }
}
