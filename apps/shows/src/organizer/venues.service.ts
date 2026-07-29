import { Injectable, NotFoundException } from '@nestjs/common';
import { asc, count, eq } from 'drizzle-orm';
import { venues, sections, rows, seats, type Db } from '@tickethub/db';
import type { VenueSummary, VenueDetail } from '@tickethub/contracts';

/**
 * The shared venue catalogue. No method takes an `organizerId`: a venue is a building, so nobody
 * owns a row here and there is nothing to scope (migration `0002_venues_are_shared`). Organizers
 * read it to pick a hall and to see which sections a show could put on sale.
 *
 * ponytail: read-only. The catalogue is hand-seeded; a write path belongs to an admin audience,
 * not this one.
 */
@Injectable()
export class OrganizerVenuesService {
  constructor(private readonly db: Db) {}

  async getList(): Promise<VenueSummary[]> {
    // Left joins all the way down so a hall with no sections still lists, at zero seats.
    return this.db
      .select({
        id: venues.id,
        name: venues.name,
        address: venues.address,
        city: venues.city,
        seatCount: count(seats.id),
      })
      .from(venues)
      .leftJoin(sections, eq(sections.venueId, venues.id))
      .leftJoin(rows, eq(rows.sectionId, sections.id))
      .leftJoin(seats, eq(seats.rowId, rows.id))
      .groupBy(venues.id)
      .orderBy(asc(venues.name));
  }

  async getOne(venueId: string): Promise<VenueDetail> {
    const [venue] = await this.db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
    if (!venue) throw new NotFoundException('Venue not found');

    // Every section of the hall, priced or not — furniture is the same whichever show is on, so
    // `show_section_pricing` deliberately does not join in here.
    const flat = await this.db
      .select({
        sectionId: sections.id,
        sectionName: sections.name,
        rowId: rows.id,
        rowNumber: rows.number,
        seatId: seats.id,
        seatNumber: seats.number,
      })
      .from(sections)
      .innerJoin(rows, eq(rows.sectionId, sections.id))
      .innerJoin(seats, eq(seats.rowId, rows.id))
      .where(eq(sections.venueId, venueId))
      .orderBy(asc(sections.name), asc(rows.number), asc(seats.number));

    // One pass, same as `user/shows.service.ts:seatMap`: the ORDER BY keeps each section's and
    // row's seats contiguous, so the tree is built by appending to whatever group is open.
    const built: VenueDetail['sections'] = [];
    for (const seat of flat) {
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

      row.seats.push({ id: seat.seatId, number: seat.seatNumber });
    }

    return {
      venue: { id: venue.id, name: venue.name, address: venue.address, city: venue.city },
      sections: built,
    };
  }
}
