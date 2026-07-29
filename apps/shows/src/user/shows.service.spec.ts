import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { showSectionPricing, ticketTypes } from '@tickethub/db';
import { getTestDb, seedShowGraph, type TestDb } from '@tickethub/db/testing';
import { UserShowsService } from './shows.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: UserShowsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new UserShowsService(db);
});

describe('UserShowsService.catalog', () => {
  it('returns items and a nextCursor when the page is full', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const { show } = await seedShowGraph(db, { sections: [] });
      ids.push(show.id);
    }
    const expectedCursor = [...ids].sort()[20]; // service orders by asc(id)

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toHaveLength(20);
    expect(res.nextCursor).toBe(expectedCursor);
  });

  it('returns null cursor when page is not full', async () => {
    await seedShowGraph(db, { sections: [] });

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toHaveLength(1);
    expect(res.nextCursor).toBeNull();
  });

  it('excludes unpublished shows', async () => {
    await seedShowGraph(db, { sections: [], show: { status: 'draft' } });

    const res = await svc.catalog({ limit: 20 });

    expect(res.items).toEqual([]);
  });

  it('filters by cursor when one is given', async () => {
    const { show } = await seedShowGraph(db, { sections: [] });

    const res = await svc.catalog({ limit: 20, cursor: show.id });

    expect(res.items).toEqual([]); // show's own id is not > itself
    expect(res.nextCursor).toBeNull();
  });
});

describe('UserShowsService.detail', () => {
  it('returns the show when found', async () => {
    const { show } = await seedShowGraph(db, { sections: [], show: { title: 'Show' } });

    const res = await svc.detail(show.id);

    expect(res.id).toBe(show.id);
    expect(res.title).toBe('Show');
  });

  it('throws NotFound when the show is missing', async () => {
    await expect(svc.detail('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFound for a draft show', async () => {
    const { show } = await seedShowGraph(db, { sections: [], show: { status: 'draft' } });

    await expect(svc.detail(show.id)).rejects.toThrow(NotFoundException);
  });

  // The regression guard for the browse-vs-permalink rule: buyers hold tickets to a cancelled
  // show, and their ticket list reads the title back through this very method.
  it('still resolves a cancelled show', async () => {
    const { show } = await seedShowGraph(db, { sections: [], show: { status: 'cancelled' } });

    expect((await svc.detail(show.id)).status).toBe('cancelled');
  });

  // The show page's price list. Dearest first, and every field is the organizer's own —
  // the page has nothing left to invent.
  it('returns the price tiers dearest first', async () => {
    const { show, sections } = await seedShowGraph(db, {
      sections: [{ name: 'Balcony' }, { name: 'Orchestra' }],
      ticketType: { name: 'Balcony', tier: 'economy', priceCents: 5_500 },
    });
    const [vip] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'VIP', tier: 'vip', priceCents: 18_000 })
      .returning();

    // The fixture mapped both sections onto the cheap band; move Orchestra onto VIP so each
    // band prices a section and both belong on the price list.
    await db
      .update(showSectionPricing)
      .set({ ticketTypeId: vip.id })
      .where(eq(showSectionPricing.sectionId, sections[1].section.id));

    const res = await svc.detail(show.id);

    expect(
      res.priceTiers.map(({ name, tier, priceCents }) => ({ name, tier, priceCents })),
    ).toEqual([
      { name: 'VIP', tier: 'vip', priceCents: 18_000 },
      { name: 'Balcony', tier: 'economy', priceCents: 5_500 },
    ]);
  });

  it('returns no price tiers for a show with nothing on sale', async () => {
    const { show } = await seedShowGraph(db, { sections: [], ticketType: false });

    expect((await svc.detail(show.id)).priceTiers).toEqual([]);
  });

  // A band mapped to no section prices no seat, so quoting it on the show page advertises
  // a price the seat map can never honour.
  it('omits a ticket type that prices no section', async () => {
    const { show } = await seedShowGraph(db, { sections: [{ name: 'A' }] });
    await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'Phantom', tier: 'vip', priceCents: 99_000 });

    const res = await svc.detail(show.id);

    expect(res.priceTiers.map((tier) => tier.name)).toEqual(['Standard']);
  });

  // One band over several sections is still one row on the price list.
  it('lists a band shared by several sections once', async () => {
    const { show } = await seedShowGraph(db, {
      sections: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    });

    expect((await svc.detail(show.id)).priceTiers).toHaveLength(1);
  });
});

describe('UserShowsService.seatMap', () => {
  it('throws NotFound when the show is missing', async () => {
    await expect(svc.seatMap('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFound for a draft show', async () => {
    const { show } = await seedShowGraph(db, {
      sections: [{ name: 'A', rows: 1, seatsPerRow: 1 }],
      show: { status: 'draft' },
    });

    await expect(svc.seatMap(show.id)).rejects.toThrow(NotFoundException);
  });

  it('builds the seat map from sections, rows, and seats', async () => {
    const { show, sections } = await seedShowGraph(db, {
      sections: [{ name: 'A', rows: 1, seatsPerRow: 1 }],
    });
    const seededSeat = sections[0].rows[0].seats[0];

    const map = await svc.seatMap(show.id);

    expect(map.showId).toBe(show.id);
    expect(map.sections[0].name).toBe('A');
    expect(map.sections[0].rows[0].seats[0].id).toBe(seededSeat.id);
  });

  // Without this the buy path is dead: createOrder needs a real ticketTypeId per seat,
  // and orders 400s with "Unknown ticketTypeId" on anything else.
  it('prices every seat of a sold section through that section’s ticket type', async () => {
    const { show, ticketType } = await seedShowGraph(db, {
      sections: [{ name: 'A', rows: 1, seatsPerRow: 2 }],
    });

    const map = await svc.seatMap(show.id);

    const seatsOut = map.sections[0].rows[0].seats;
    expect(ticketType).toBeDefined();
    expect(seatsOut).toHaveLength(2);
    expect(seatsOut.every((seat) => seat.ticketTypeId === ticketType?.id)).toBe(true);
    // The price the UI shows has to be the price orders charges, not a number it invented.
    expect(seatsOut.every((seat) => seat.priceCents === ticketType?.priceCents)).toBe(true);
  });

  it('prices each section through its own mapped ticket type', async () => {
    const {
      show,
      venue,
      sections: seeded,
    } = await seedShowGraph(db, {
      sections: [
        { name: 'Orchestra', rows: 1, seatsPerRow: 1 },
        { name: 'Balcony', rows: 1, seatsPerRow: 1 },
      ],
      ticketType: false,
    });

    const [vip] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'VIP', tier: 'vip', priceCents: 18_000 })
      .returning();
    const [cheap] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'Balcony', tier: 'economy', priceCents: 5_500 })
      .returning();

    await db.insert(showSectionPricing).values([
      {
        showId: show.id,
        sectionId: seeded[0].section.id,
        venueId: venue.id,
        ticketTypeId: vip.id,
      },
      {
        showId: show.id,
        sectionId: seeded[1].section.id,
        venueId: venue.id,
        ticketTypeId: cheap.id,
      },
    ]);

    const map = await svc.seatMap(show.id);

    const bySection = new Map(map.sections.map((section) => [section.name, section]));

    expect(bySection.get('Orchestra')!.rows[0].seats[0]).toMatchObject({
      ticketTypeId: vip.id,
      priceCents: 18_000,
      tier: 'vip',
    });
    expect(bySection.get('Balcony')!.rows[0].seats[0]).toMatchObject({
      ticketTypeId: cheap.id,
      priceCents: 5_500,
      tier: 'economy',
    });
  });

  // The point of the mapping table: one band prices several sections, so re-pricing it moves
  // both at once instead of drifting apart across duplicated rows.
  it('lets one ticket type price several sections', async () => {
    const {
      show,
      venue,
      sections: seeded,
    } = await seedShowGraph(db, {
      sections: [
        { name: 'Balcony', rows: 1, seatsPerRow: 1 },
        { name: 'Loge', rows: 1, seatsPerRow: 1 },
      ],
      ticketType: false,
    });

    const [shared] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'VIP', tier: 'vip', priceCents: 30_000 })
      .returning();

    await db.insert(showSectionPricing).values(
      seeded.map(({ section }) => ({
        showId: show.id,
        sectionId: section.id,
        venueId: venue.id,
        ticketTypeId: shared.id,
      })),
    );

    const map = await svc.seatMap(show.id);

    expect(map.sections).toHaveLength(2);
    expect(
      map.sections.every((section) => section.rows[0].seats[0].ticketTypeId === shared.id),
    ).toBe(true);
    expect(map.sections.every((section) => section.rows[0].seats[0].priceCents === 30_000)).toBe(
      true,
    );
  });

  // No show-wide fallback any more: an unmapped section is not on sale, so it never reaches the
  // map with an id the buyer could send to createOrder.
  it('omits sections the show does not sell', async () => {
    const {
      show,
      venue,
      sections: seeded,
    } = await seedShowGraph(db, {
      sections: [
        { name: 'Sold', rows: 1, seatsPerRow: 1 },
        { name: 'Closed', rows: 1, seatsPerRow: 1 },
      ],
      ticketType: false,
    });

    const [type] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'Standard', tier: 'standard', priceCents: 5_000 })
      .returning();

    await db.insert(showSectionPricing).values({
      showId: show.id,
      sectionId: seeded[0].section.id,
      venueId: venue.id,
      ticketTypeId: type.id,
    });

    const map = await svc.seatMap(show.id);

    expect(map.sections.map((section) => section.name)).toEqual(['Sold']);
  });

  it('returns an empty seat map for a show with nothing on sale', async () => {
    const { show } = await seedShowGraph(db, {
      sections: [{ name: 'A', rows: 1, seatsPerRow: 1 }],
      ticketType: false,
    });

    expect((await svc.seatMap(show.id)).sections).toEqual([]);
  });

  it('rejects selling a section that belongs to another venue', async () => {
    const { show, venue } = await seedShowGraph(db, { sections: [{ name: 'A' }] });
    const other = await seedShowGraph(db, { sections: [{ name: 'Foreign' }] });
    const [type] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'Standard', priceCents: 5_000 })
      .returning();

    await expect(
      db.insert(showSectionPricing).values({
        showId: show.id,
        sectionId: other.sections[0].section.id,
        venueId: venue.id,
        ticketTypeId: type.id,
      }),
    ).rejects.toThrow();
  });

  it('rejects a second ticket type for the same section', async () => {
    const {
      show,
      venue,
      sections: seeded,
    } = await seedShowGraph(db, {
      sections: [{ name: 'A' }],
    });
    const [second] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'Other', priceCents: 9_000 })
      .returning();

    await expect(
      db.insert(showSectionPricing).values({
        showId: show.id,
        sectionId: seeded[0].section.id,
        venueId: venue.id,
        ticketTypeId: second.id,
      }),
    ).rejects.toThrow();
  });
});
