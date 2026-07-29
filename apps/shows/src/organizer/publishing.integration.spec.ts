import { eq, sql } from 'drizzle-orm';
import { loadEnv, requireEnv } from '@tickethub/env';
import {
  createDb,
  organizers,
  rows,
  seats,
  sections,
  shows,
  showSectionPricing,
  showsOutbox,
  ticketTypes,
  users,
  venues,
  type Db,
} from '@tickethub/db';
import { seedShowGraph } from '@tickethub/db/testing';
import { OutboxRepository } from '@tickethub/outbox';
import { OrganizerPublishingService } from './publishing.service';
import { UserShowsService } from '../user/shows.service';

jest.setTimeout(30_000);

/**
 * Real Postgres, because the two things under test are the database's own: the composite foreign
 * keys that pin a show and a section to the same building, and whether what the organizer priced
 * is exactly what the buyer's seat map offers. pglite would prove neither convincingly.
 */
describe('Organizer pricing and publishing (integration: real Postgres)', () => {
  let db: Db;
  let svc: OrganizerPublishingService;
  let buyerView: UserShowsService;

  beforeAll(() => {
    loadEnv();
    db = createDb(requireEnv('DATABASE_URL'));
    svc = new OrganizerPublishingService(db, new OutboxRepository(db, showsOutbox));
    buyerView = new UserShowsService(db);
  });

  // The whole show graph, not just the outbox: the fixtures mint emails and titles from a
  // per-process counter, so leftovers from a previous run collide on the second one.
  beforeEach(async () => {
    await db.execute(
      sql`truncate ${sql.raw('"shows"."outbox"')}, ${showSectionPricing}, ${ticketTypes}, ${shows}, ${seats}, ${rows}, ${sections}, ${venues}, ${organizers}, ${users} restart identity cascade`,
    );
  });

  /** A future draft in a hall of two two-seat sections, nothing priced yet. */
  const seedDraft = () =>
    seedShowGraph(db, {
      show: { status: 'draft', startsAt: new Date(Date.now() + 86_400_000) },
      sections: [
        { name: 'Stalls', rows: 1, seatsPerRow: 2 },
        { name: 'Balcony', rows: 1, seatsPerRow: 2 },
      ],
      ticketType: false,
    });

  it('publishes once and republishes never — exactly one show.published message', async () => {
    const { show, organizer, sections: built } = await seedDraft();

    await svc.putPricing(organizer.userId, show.id, {
      ticketTypes: [{ key: 'flat', name: 'Flat', tier: 'standard', priceCents: 2500 }],
      assignments: built.map(({ section }) => ({
        sectionId: section.id,
        ticketTypeKey: 'flat',
      })),
    });

    await svc.publishShow(organizer.userId, show.id);
    await expect(svc.publishShow(organizer.userId, show.id)).rejects.toThrow();

    const messages = await db
      .select()
      .from(showsOutbox)
      .where(eq(showsOutbox.routingKey, 'show.published'));

    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toMatchObject({ showId: show.id });
  });

  // The end-to-end proof that the console and the buyer path agree on what is on sale.
  it('hands the buyer’s seat map exactly the tiers and prices the organizer set', async () => {
    const { show, organizer, sections: built } = await seedDraft();
    const [stalls, balcony] = built;

    await svc.putPricing(organizer.userId, show.id, {
      ticketTypes: [
        { key: 'vip', name: 'VIP', tier: 'vip', priceCents: 9000 },
        { key: 'cheap', name: 'Rear', tier: 'economy', priceCents: 1500 },
      ],
      // Balcony is left unpriced on purpose: an unpriced section is not on sale, and must not
      // appear on the seat map at all.
      assignments: [{ sectionId: stalls.section.id, ticketTypeKey: 'vip' }],
    });

    // The buyer's read is a public permalink, and a draft 404s there — publishing is what makes
    // the seat map reachable at all, so the round trip has to go through it.
    await svc.publishShow(organizer.userId, show.id);

    const map = await buyerView.seatMap(show.id);

    expect(map.sections.map((section) => section.id)).toEqual([stalls.section.id]);
    expect(map.sections.map((section) => section.id)).not.toContain(balcony.section.id);

    // Scoped to the show: the integration db is shared, so a bare name lookup would find another
    // test's band.
    const [band] = await db.select().from(ticketTypes).where(eq(ticketTypes.showId, show.id));
    const offered = map.sections[0].rows.flatMap((row) => row.seats);

    expect(offered).toHaveLength(2);
    expect(offered.every((seat) => seat.ticketTypeId === band.id)).toBe(true);
    expect(offered.every((seat) => seat.priceCents === 9000 && seat.tier === 'vip')).toBe(true);
  });

  it('re-pricing a published-then-drafted show never leaks the old bands into the seat map', async () => {
    const { show, organizer, sections: built } = await seedDraft();

    await svc.putPricing(organizer.userId, show.id, {
      ticketTypes: [{ key: 'old', name: 'Old', tier: 'standard', priceCents: 100 }],
      assignments: built.map(({ section }) => ({ sectionId: section.id, ticketTypeKey: 'old' })),
    });
    await svc.putPricing(organizer.userId, show.id, {
      ticketTypes: [{ key: 'new', name: 'New', tier: 'vip', priceCents: 7000 }],
      assignments: [{ sectionId: built[0].section.id, ticketTypeKey: 'new' }],
    });
    await svc.publishShow(organizer.userId, show.id);

    const map = await buyerView.seatMap(show.id);
    const offered = map.sections.flatMap((section) => section.rows.flatMap((row) => row.seats));

    expect(offered).toHaveLength(2);
    expect(offered.every((seat) => seat.priceCents === 7000)).toBe(true);
  });

  // With the service's own check bypassed, the composite FKs must still refuse: they are the
  // guarantee, and the 400 above is only a better error message in front of them.
  it('the database itself refuses a section from a different venue', async () => {
    const { show, sections: built } = await seedDraft();
    const [elsewhere] = await db
      .insert(venues)
      .values({ name: `Other ${Date.now()}` })
      .returning();
    const [foreign] = await db
      .insert(sections)
      .values({ venueId: elsewhere.id, name: 'Stalls' })
      .returning();

    const [band] = await db
      .insert(ticketTypes)
      .values({ showId: show.id, name: 'Flat', priceCents: 1000 })
      .returning();

    await expect(
      db.insert(showSectionPricing).values({
        showId: show.id,
        sectionId: foreign.id,
        // The show's venue, as the service would copy it — the section is the mismatch.
        venueId: built[0].section.venueId,
        ticketTypeId: band.id,
      }),
    ).rejects.toThrow();
  });
});
