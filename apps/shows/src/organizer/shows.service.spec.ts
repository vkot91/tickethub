import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { seatLabel } from '@tickethub/common';
import {
  organizers,
  priceBands,
  shows,
  showSectionPricing,
  showsOutbox,
  venues,
} from '@tickethub/db';
import { getTestDb, seedShowGraph, seedUser, type TestDb } from '@tickethub/db/testing';
import { OutboxRepository } from '@tickethub/outbox';

import { OrganizerPublishingService } from './publishing.service';
import { OrganizerShowsService } from './shows.service';

// Fresh emulated Postgres per test comes from the nest-db jest preset.
let db: TestDb;
let svc: OrganizerShowsService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerShowsService(
    db,
    new OrganizerPublishingService(db, new OutboxRepository(db, showsOutbox)),
  );
});

const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';

/** An organizer with no shows yet — the starting point for every create/update case. */
async function seedOrganizer() {
  const user = await seedUser(db);

  const [organizer] = await db
    .insert(organizers)
    .values({ userId: user.id, name: 'Solo Promotions' })
    .returning();

  const [venue] = await db
    .insert(venues)
    .values({ name: `Hall ${organizer.id}` })
    .returning();

  return { userId: user.id, organizerId: organizer.id, venueId: venue.id };
}

describe('OrganizerShowsService.showIds', () => {
  it('returns only the calling organizer’s shows, whatever their status', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      sections: [],
      show: { status: 'draft' },
    });
    await seedShowGraph(db, { sections: [] }); // someone else's

    await expect(svc.showIds(organizer.userId)).resolves.toEqual([show.id]);
  });

  it('returns an empty list for a user who is not an organizer', async () => {
    const user = await seedUser(db);

    await expect(svc.showIds(user.id)).resolves.toEqual([]);
  });
});

describe('OrganizerShowsService.showNames', () => {
  it('returns id and title only, newest first, whatever the status', async () => {
    const { organizerId, userId, venueId } = await seedOrganizer();
    const [older, newer] = await db
      .insert(shows)
      .values([
        {
          organizerId,
          venueId,
          title: 'Older Show',
          startsAt: new Date('2026-01-01T20:00:00Z'),
          status: 'draft',
        },
        { organizerId, venueId, title: 'Newer Show', startsAt: new Date('2026-06-01T20:00:00Z') },
      ])
      .returning();
    await seedShowGraph(db, { sections: [] }); // someone else's

    await expect(svc.showNames(userId)).resolves.toEqual([
      { id: newer.id, title: 'Newer Show' },
      { id: older.id, title: 'Older Show' },
    ]);
  });

  it('returns an empty list for a user who is not an organizer', async () => {
    const user = await seedUser(db);

    await expect(svc.showNames(user.id)).resolves.toEqual([]);
  });
});

describe('OrganizerShowsService.myShows', () => {
  it('returns the show with its venue, and sales numbers zeroed for now', async () => {
    const { show, organizer, venue } = await seedShowGraph(db, { sections: [] });
    await db.update(venues).set({ city: 'Lisbon' }).where(eq(venues.id, venue.id));

    const [listed] = await svc.myShows(organizer.userId);

    expect(listed).toMatchObject({
      id: show.id,
      title: show.title,
      venueId: venue.id,
      venueName: venue.name,
      city: 'Lisbon',
      status: 'published',
      // Sales live in `apps/orders`; the gateway merges them onto this list. Zero, never omitted.
      soldCount: 0,
      capacity: 0,
      revenueCents: 0,
    });
    expect(listed.startsAt).toBe(show.startsAt.toISOString());
  });

  it('lists newest first and never another organizer’s show', async () => {
    const { organizerId, userId, venueId } = await seedOrganizer();
    await db.insert(shows).values([
      { organizerId, venueId, title: 'Older', startsAt: new Date('2026-01-01T20:00:00Z') },
      { organizerId, venueId, title: 'Newer', startsAt: new Date('2026-09-01T20:00:00Z') },
    ]);
    await seedShowGraph(db, { sections: [] }); // someone else's

    const listed = await svc.myShows(userId);

    expect(listed.map((show) => show.title)).toEqual(['Newer', 'Older']);
  });

  it('filters by status when asked', async () => {
    const { organizerId, userId, venueId } = await seedOrganizer();
    await db.insert(shows).values([
      { organizerId, venueId, title: 'A draft', startsAt: new Date(), status: 'draft' },
      { organizerId, venueId, title: 'On sale', startsAt: new Date(), status: 'published' },
    ]);

    const drafts = await svc.myShows(userId, { status: 'draft' });

    expect(drafts.map((show) => show.title)).toEqual(['A draft']);
  });

  it('nulls a sale start that has not been set', async () => {
    const { organizer } = await seedShowGraph(db, { sections: [] });

    const [listed] = await svc.myShows(organizer.userId);

    expect(listed.saleStartsAt).toBeNull();
  });
});

describe('OrganizerShowsService.getShow', () => {
  // Same shape as the list, so the console's card and its detail page share one type.
  it('returns the caller’s own show, shaped exactly as the list row', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      sections: [],
      show: { status: 'draft' },
    });

    const [listed] = await svc.myShows(organizer.userId);

    expect(await svc.getShow(organizer.userId, show.id)).toEqual(listed);
  });
});

describe('OrganizerShowsService.createShow', () => {
  const dto = (venueId: string, title = 'Neon Nights') => ({
    title,
    description: 'A night of synths',
    venueId,
    startsAt: '2026-12-01T20:00:00.000Z',
  });

  it('creates the show as a draft', async () => {
    const { userId, venueId } = await seedOrganizer();

    const created = await svc.createShow(userId, dto(venueId));

    expect(created).toMatchObject({ title: 'Neon Nights', status: 'draft', venueId });

    const [stored] = await db.select().from(shows).where(eq(shows.id, created.id));
    expect(stored.status).toBe('draft');
  });

  it('rejects the same title in the same venue at the same time', async () => {
    const { userId, venueId } = await seedOrganizer();
    await svc.createShow(userId, dto(venueId));

    await expect(svc.createShow(userId, dto(venueId))).rejects.toThrow(ConflictException);
  });

  // `shows_venue_title_slot_uq` claims a slot, not a name: a tour keeps its title in every city.
  it('lets the same organizer reuse a title in another venue', async () => {
    const { userId, venueId } = await seedOrganizer();
    const [elsewhere] = await db.insert(venues).values({ name: 'Second City' }).returning();
    await svc.createShow(userId, dto(venueId));

    await expect(svc.createShow(userId, dto(elsewhere.id))).resolves.toMatchObject({
      title: 'Neon Nights',
      venueId: elsewhere.id,
    });
  });

  // The run that already happened does not retire the name. Neon Nights at this hall tonight,
  // Neon Nights at the same hall next week — different organizer, and still fine.
  it('lets another organizer run the same title in the same venue on another date', async () => {
    const first = await seedOrganizer();
    const second = await seedOrganizer();
    await svc.createShow(first.userId, {
      ...dto(first.venueId),
      startsAt: '2026-12-01T20:00:00.000Z',
    });

    await expect(
      svc.createShow(second.userId, {
        ...dto(first.venueId),
        startsAt: '2026-12-08T20:00:00.000Z',
      }),
    ).resolves.toMatchObject({ title: 'Neon Nights', venueId: first.venueId });
  });

  // Same hall, same name, same instant is one show entered twice — the only duplicate a buyer
  // could not tell apart, whoever entered it.
  it('rejects another organizer’s title in the same venue at the same time', async () => {
    const first = await seedOrganizer();
    const second = await seedOrganizer();
    await svc.createShow(first.userId, dto(first.venueId));

    await expect(svc.createShow(second.userId, dto(first.venueId))).rejects.toThrow(
      ConflictException,
    );
  });

  it('404s on a venue that is not in the catalogue', async () => {
    const { userId } = await seedOrganizer();

    await expect(svc.createShow(userId, dto(UNKNOWN_ID))).rejects.toThrow(NotFoundException);
  });

  it('404s for a user who never became an organizer', async () => {
    const { venueId } = await seedOrganizer();
    const stranger = await seedUser(db);

    await expect(svc.createShow(stranger.id, dto(venueId))).rejects.toThrow(NotFoundException);
  });
});

describe('OrganizerShowsService.updateShow', () => {
  it('edits every field of a draft', async () => {
    const { userId, venueId, organizerId } = await seedOrganizer();
    const [draft] = await db
      .insert(shows)
      .values({ organizerId, venueId, title: 'Draft', startsAt: new Date() })
      .returning();
    const [other] = await db.insert(venues).values({ name: 'Other Hall' }).returning();

    const updated = await svc.updateShow(userId, draft.id, {
      title: 'Renamed',
      description: 'New blurb',
      venueId: other.id,
      startsAt: '2027-01-01T18:00:00.000Z',
      posterUrl: 'https://cdn.test/p.jpg',
      saleStartsAt: '2026-11-01T10:00:00.000Z',
    });

    expect(updated).toMatchObject({
      title: 'Renamed',
      description: 'New blurb',
      venueId: other.id,
      posterUrl: 'https://cdn.test/p.jpg',
      saleStartsAt: '2026-11-01T10:00:00.000Z',
    });
  });

  // The allow-list, one case per status × field. Silently dropping a venue change is how a show
  // ends up selling the wrong building, so a rejected field is a 409, never a no-op.
  const ALLOWED_WHEN_PUBLISHED = ['title', 'description', 'posterUrl', 'saleStartsAt'] as const;
  const REJECTED_WHEN_PUBLISHED = ['venueId', 'startsAt'] as const;

  const patchFor = (field: string, venueId: string): Record<string, string> =>
    ({
      title: { title: 'Retitled' },
      description: { description: 'Rewritten' },
      posterUrl: { posterUrl: 'https://cdn.test/x.jpg' },
      saleStartsAt: { saleStartsAt: '2026-10-01T10:00:00.000Z' },
      venueId: { venueId },
      startsAt: { startsAt: '2027-02-02T20:00:00.000Z' },
    })[field] as Record<string, string>;

  it.each(ALLOWED_WHEN_PUBLISHED)('allows %s on a published show', async (field) => {
    const { userId, venueId, organizerId } = await seedOrganizer();
    const [show] = await db
      .insert(shows)
      .values({ organizerId, venueId, title: 'Live', startsAt: new Date(), status: 'published' })
      .returning();

    await expect(svc.updateShow(userId, show.id, patchFor(field, venueId))).resolves.toMatchObject({
      status: 'published',
    });
  });

  it.each(REJECTED_WHEN_PUBLISHED)('rejects %s on a published show', async (field) => {
    const { userId, venueId, organizerId } = await seedOrganizer();
    const [show] = await db
      .insert(shows)
      .values({ organizerId, venueId, title: 'Live', startsAt: new Date(), status: 'published' })
      .returning();
    const [other] = await db
      .insert(venues)
      .values({ name: `Other ${field}` })
      .returning();

    await expect(svc.updateShow(userId, show.id, patchFor(field, other.id))).rejects.toThrow(
      ConflictException,
    );
  });

  it.each([...ALLOWED_WHEN_PUBLISHED, ...REJECTED_WHEN_PUBLISHED])(
    'rejects %s on a cancelled show',
    async (field) => {
      const { userId, venueId, organizerId } = await seedOrganizer();
      const [show] = await db
        .insert(shows)
        .values({ organizerId, venueId, title: 'Off', startsAt: new Date(), status: 'cancelled' })
        .returning();

      await expect(svc.updateShow(userId, show.id, patchFor(field, venueId))).rejects.toThrow(
        ConflictException,
      );
    },
  );

  it('rejects any edit to a finished show', async () => {
    const { userId, venueId, organizerId } = await seedOrganizer();
    const [show] = await db
      .insert(shows)
      .values({ organizerId, venueId, title: 'Done', startsAt: new Date(), status: 'finished' })
      .returning();

    await expect(svc.updateShow(userId, show.id, { title: 'Nope' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('clears the pricing when a draft moves to another venue', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      show: { status: 'draft' },
      sections: [{ name: 'Stalls', rows: 1, seatsPerRow: 2 }],
    });
    const [other] = await db.insert(venues).values({ name: 'Elsewhere' }).returning();

    await svc.updateShow(organizer.userId, show.id, { venueId: other.id });

    const pricing = await db
      .select()
      .from(showSectionPricing)
      .where(eq(showSectionPricing.showId, show.id));
    expect(pricing).toEqual([]);
  });

  it('keeps the price bands when a draft moves to another venue', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      show: { status: 'draft' },
      sections: [{ name: 'Stalls', rows: 1, seatsPerRow: 2 }],
      priceBand: { name: 'Front VIP', tier: 'vip', priceCents: 9_000 },
    });
    const [other] = await db.insert(venues).values({ name: 'Another Hall' }).returning();

    await svc.updateShow(organizer.userId, show.id, { venueId: other.id });

    const bands = await db.select().from(priceBands).where(eq(priceBands.showId, show.id));
    expect(bands).toMatchObject([{ name: 'Front VIP', priceCents: 9_000 }]);
  });

  it('keeps the pricing when a draft edit leaves the venue alone', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      show: { status: 'draft' },
      sections: [{ name: 'Stalls', rows: 1, seatsPerRow: 2 }],
    });

    await svc.updateShow(organizer.userId, show.id, { title: 'Same hall, new name' });

    const pricing = await db
      .select()
      .from(showSectionPricing)
      .where(eq(showSectionPricing.showId, show.id));
    expect(pricing).toHaveLength(1);
  });

  it('404s on a venue that is not in the catalogue', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      show: { status: 'draft' },
      sections: [],
    });

    await expect(
      svc.updateShow(organizer.userId, show.id, { venueId: UNKNOWN_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  // Both in the same slot, so the rename collides on `shows_venue_title_slot_uq`.
  it('409s on a title another show in the same venue and slot already uses', async () => {
    const { userId, venueId, organizerId } = await seedOrganizer();
    const slot = new Date('2026-12-01T20:00:00Z');
    await db.insert(shows).values({ organizerId, venueId, title: 'Taken', startsAt: slot });
    const [draft] = await db
      .insert(shows)
      .values({ organizerId, venueId, title: 'Free', startsAt: slot })
      .returning();

    await expect(svc.updateShow(userId, draft.id, { title: 'Taken' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('clears a poster with an explicit null', async () => {
    const { userId, venueId, organizerId } = await seedOrganizer();
    const [draft] = await db
      .insert(shows)
      .values({
        organizerId,
        venueId,
        title: 'Postered',
        startsAt: new Date(),
        posterUrl: 'https://cdn.test/old.jpg',
      })
      .returning();

    await expect(svc.updateShow(userId, draft.id, { posterUrl: null })).resolves.toMatchObject({
      posterUrl: null,
    });
  });
});

describe('OrganizerShowsService.deleteShow', () => {
  it('deletes a draft with its price bands and pricing, in one go', async () => {
    const { show, organizer } = await seedShowGraph(db, {
      show: { status: 'draft' },
      sections: [{ name: 'Stalls', rows: 1, seatsPerRow: 2 }],
    });

    await svc.deleteShow(organizer.userId, show.id);

    expect(await db.select().from(shows).where(eq(shows.id, show.id))).toEqual([]);
    expect(await db.select().from(priceBands).where(eq(priceBands.showId, show.id))).toEqual([]);
    expect(
      await db.select().from(showSectionPricing).where(eq(showSectionPricing.showId, show.id)),
    ).toEqual([]);
  });

  // The published branch: a show people hold tickets to is cancelled and kept, never deleted, and
  // the refund fan-out rides the outbox message written in the same transaction.
  it('cancels a published show instead of deleting it, and enqueues show.cancelled', async () => {
    const { show, organizer } = await seedShowGraph(db, { show: { status: 'published' } });

    await svc.deleteShow(organizer.userId, show.id);

    const [kept] = await db.select().from(shows).where(eq(shows.id, show.id));
    expect(kept.status).toBe('cancelled');

    const messages = await db
      .select()
      .from(showsOutbox)
      .where(eq(showsOutbox.routingKey, 'show.cancelled'));
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toMatchObject({ showId: show.id });
  });

  it.each(['cancelled', 'finished'] as const)('refuses to delete a %s show', async (status) => {
    const { show, organizer } = await seedShowGraph(db, { show: { status }, sections: [] });

    await expect(svc.deleteShow(organizer.userId, show.id)).rejects.toThrow(ConflictException);
  });
});

// Ownership is a 404, never a 403: an organizer must not be able to probe for a competitor's
// show by id. Table-driven so a method added later without the filter fails here.
describe('OrganizerShowsService ownership', () => {
  const CASES = [
    [
      'updateShow',
      (service: OrganizerShowsService, userId: string, showId: string) =>
        service.updateShow(userId, showId, { title: 'Mine now' }),
    ],
    [
      'deleteShow',
      (service: OrganizerShowsService, userId: string, showId: string) =>
        service.deleteShow(userId, showId),
    ],
    [
      'getShow',
      (service: OrganizerShowsService, userId: string, showId: string) =>
        service.getShow(userId, showId),
    ],
  ] as const;

  it.each(CASES)('%s 404s on another organizer’s show', async (_name, call) => {
    const { show } = await seedShowGraph(db, { show: { status: 'draft' }, sections: [] });
    const intruder = await seedOrganizer();

    await expect(call(svc, intruder.userId, show.id)).rejects.toThrow(NotFoundException);
  });

  it.each(CASES)('%s 404s on a show that does not exist', async (_name, call) => {
    const intruder = await seedOrganizer();

    await expect(call(svc, intruder.userId, UNKNOWN_ID)).rejects.toThrow(NotFoundException);
  });

  it('myShows excludes shows the caller does not own', async () => {
    const { organizerId, userId, venueId } = await seedOrganizer();
    await db.insert(shows).values({ organizerId, venueId, title: 'Mine', startsAt: new Date() });
    await seedShowGraph(db, { sections: [] });

    const listed = await svc.myShows(userId);

    expect(listed.map((show) => show.title)).toEqual(['Mine']);
  });

  it('leaves another organizer’s show untouched after a failed update', async () => {
    const { show } = await seedShowGraph(db, { show: { status: 'draft' }, sections: [] });
    const intruder = await seedOrganizer();

    await expect(svc.updateShow(intruder.userId, show.id, { title: 'Mine now' })).rejects.toThrow(
      NotFoundException,
    );

    const [stored] = await db
      .select()
      .from(shows)
      .where(and(eq(shows.id, show.id), eq(shows.title, show.title)));
    expect(stored).toBeDefined();
  });
});

describe('OrganizerShowsService.summaries', () => {
  it('counts the seats of priced sections only', async () => {
    const {
      show,
      venue,
      sections: built,
      priceBand,
    } = await seedShowGraph(db, {
      sections: [
        { name: 'Stalls', rows: 2, seatsPerRow: 3 },
        { name: 'Balcony', rows: 1, seatsPerRow: 4 },
      ],
    });

    // seedShowGraph prices every section; drop the balcony back off sale.
    await db
      .delete(showSectionPricing)
      .where(
        and(
          eq(showSectionPricing.showId, show.id),
          eq(showSectionPricing.sectionId, built[1].section.id),
        ),
      );

    expect(priceBand).toBeDefined();
    expect(venue).toBeDefined();
    await expect(svc.summaries([show.id])).resolves.toEqual([
      { showId: show.id, title: show.title, capacity: 6, saleStartsAt: null },
    ]);
  });

  it('returns a row per requested show, zero included, batched in one call', async () => {
    const priced = await seedShowGraph(db, { sections: [{ rows: 1, seatsPerRow: 2 }] });
    const unpriced = await seedShowGraph(db, {
      sections: [{ rows: 1, seatsPerRow: 2 }],
      priceBand: false,
    });

    const summaries = await svc.summaries([priced.show.id, unpriced.show.id]);

    expect(summaries).toEqual([
      { showId: priced.show.id, title: priced.show.title, capacity: 2, saleStartsAt: null },
      { showId: unpriced.show.id, title: unpriced.show.title, capacity: 0, saleStartsAt: null },
    ]);
  });

  // Rides along on this call rather than costing the dashboard its own round trip for one
  // nullable timestamp — the gateway clips the revenue graph to it.
  it('carries the sale start alongside the count, as an ISO string', async () => {
    const saleStartsAt = new Date('2026-07-01T09:00:00.000Z');
    const { show } = await seedShowGraph(db, {
      sections: [{ rows: 1, seatsPerRow: 2 }],
      show: { saleStartsAt },
    });

    await expect(svc.summaries([show.id])).resolves.toEqual([
      { showId: show.id, title: show.title, capacity: 2, saleStartsAt: '2026-07-01T09:00:00.000Z' },
    ]);
  });

  it('returns nothing for an empty list', async () => {
    await expect(svc.summaries([])).resolves.toEqual([]);
  });

  // The title is here so the console never has to ask the buyer's `detail` for it — that endpoint
  // 404s a draft, and drafts are exactly what this audience authors.
  it('carries the title, so the console never reaches for the buyer catalog', async () => {
    const { show } = await seedShowGraph(db, { sections: [{ rows: 1, seatsPerRow: 1 }] });

    await expect(svc.summaries([show.id])).resolves.toEqual([
      expect.objectContaining({ showId: show.id, title: show.title }),
    ]);
  });
});

describe('OrganizerShowsService.seatLabels', () => {
  it('labels exactly the seats asked about', async () => {
    const { show, sections: built } = await seedShowGraph(db, {
      sections: [{ name: 'Stalls', rows: 2, seatsPerRow: 2 }],
    });
    const [first, second] = built[0].rows[0].seats;

    await expect(svc.seatLabels(show.id, [first.id])).resolves.toEqual({
      [first.id]: seatLabel('Stalls', 1, 1),
    });
    await expect(svc.seatLabels(show.id, [first.id, second.id])).resolves.toEqual({
      [first.id]: seatLabel('Stalls', 1, 1),
      [second.id]: seatLabel('Stalls', 1, 2),
    });
  });

  // A seat of a show the caller did not ask about must not come back through the same call.
  it('never labels a seat outside the given show', async () => {
    const mine = await seedShowGraph(db, { sections: [{ rows: 1, seatsPerRow: 1 }] });
    const other = await seedShowGraph(db, { sections: [{ rows: 1, seatsPerRow: 1 }] });

    await expect(
      svc.seatLabels(mine.show.id, [other.sections[0].rows[0].seats[0].id]),
    ).resolves.toEqual({});
  });

  it('returns nothing for an empty seat list', async () => {
    const { show } = await seedShowGraph(db, { sections: [{ rows: 1, seatsPerRow: 1 }] });

    await expect(svc.seatLabels(show.id, [])).resolves.toEqual({});
  });
});

describe('OrganizerShowsService.tierNames', () => {
  it('labels a show’s bands, dearest first', async () => {
    const { show } = await seedShowGraph(db, {
      sections: [],
      priceBand: { name: 'Standard', priceCents: 5000 },
    });
    await db
      .insert(priceBands)
      .values({ showId: show.id, name: 'Front VIP', tier: 'vip', priceCents: 9000 });

    await expect(svc.tierNames(show.id)).resolves.toEqual([
      { id: expect.any(String), name: 'Front VIP', tier: 'vip' },
      { id: expect.any(String), name: 'Standard', tier: 'standard' },
    ]);
  });

  // Unlike the buyer's `detail`, which 404s a draft — the console authors drafts, and a draft
  // that somehow sold still owes the dashboard its labels.
  it('names a draft’s bands rather than refusing the show', async () => {
    const { show } = await seedShowGraph(db, {
      sections: [],
      show: { status: 'draft' },
      priceBand: { name: 'Early Bird', priceCents: 3000 },
    });

    await expect(svc.tierNames(show.id)).resolves.toEqual([
      { id: expect.any(String), name: 'Early Bird', tier: 'standard' },
    ]);
  });

  it('returns nothing for a show that no longer exists', async () => {
    await expect(svc.tierNames(UNKNOWN_ID)).resolves.toEqual([]);
  });
});
