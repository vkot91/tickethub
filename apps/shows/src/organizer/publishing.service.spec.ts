import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { PutPricingDto } from '@tickethub/contracts';
import {
  priceBands,
  sections,
  shows,
  showSectionPricing,
  showsOutbox,
  venues,
} from '@tickethub/db';
import { getTestDb, seedShowGraph, seedUser, type TestDb } from '@tickethub/db/testing';
import { OutboxRepository } from '@tickethub/outbox';

import { OrganizerPublishingService } from './publishing.service';

let db: TestDb;
let svc: OrganizerPublishingService;

beforeEach(async () => {
  db = await getTestDb();
  svc = new OrganizerPublishingService(db, new OutboxRepository(db, showsOutbox));
});

const UNKNOWN_ID = '00000000-0000-0000-0000-000000000000';
const FUTURE = new Date(Date.now() + 86_400_000);

/** A draft show in a two-section hall, nothing priced — the starting point for putPricing. */
async function seedDraft(sectionCount = 2) {
  const seeded = await seedShowGraph(db, {
    show: { status: 'draft', startsAt: FUTURE },
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      name: `Section ${i + 1}`,
      rows: 1,
      seatsPerRow: 2,
    })),
    priceBand: false,
  });

  return {
    ...seeded,
    userId: seeded.organizer.userId,
    sectionIds: seeded.sections.map(({ section }) => section.id),
  };
}

const band = (key: string, priceCents: number): PutPricingDto['priceBands'][number] => ({
  key,
  name: key,
  tier: 'standard',
  priceCents,
});

describe('OrganizerPublishingService.putPricing', () => {
  it('replaces the bands and the section mapping wholesale, mapping key → id', async () => {
    const { show, userId, sectionIds, venue } = await seedDraft();

    await svc.putPricing(userId, show.id, {
      priceBands: [band('vip', 9000), band('cheap', 1000)],
      assignments: [
        { sectionId: sectionIds[0], bandKey: 'vip' },
        { sectionId: sectionIds[1], bandKey: 'cheap' },
      ],
    });

    const priced = await db
      .select({
        sectionId: showSectionPricing.sectionId,
        venueId: showSectionPricing.venueId,
        name: priceBands.name,
        priceCents: priceBands.priceCents,
      })
      .from(showSectionPricing)
      .innerJoin(priceBands, eq(priceBands.id, showSectionPricing.bandId))
      .where(eq(showSectionPricing.showId, show.id));

    expect(priced).toHaveLength(2);
    expect(priced).toEqual(
      expect.arrayContaining([
        // venueId is copied from the show, never taken from the request — it is what pins both
        // composite FKs to the same building.
        expect.objectContaining({ sectionId: sectionIds[0], name: 'vip', venueId: venue.id }),
        expect.objectContaining({ sectionId: sectionIds[1], name: 'cheap', venueId: venue.id }),
      ]),
    );
  });

  it('lets two sections share one band', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await svc.putPricing(userId, show.id, {
      priceBands: [band('flat', 2500)],
      assignments: sectionIds.map((sectionId) => ({ sectionId, bandKey: 'flat' })),
    });

    const priced = await db
      .select()
      .from(showSectionPricing)
      .where(eq(showSectionPricing.showId, show.id));

    expect(priced).toHaveLength(2);
    expect(new Set(priced.map((row) => row.bandId)).size).toBe(1);
  });

  it('drops the previous bands and mapping rather than adding to them', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await svc.putPricing(userId, show.id, {
      priceBands: [band('old', 100)],
      assignments: [{ sectionId: sectionIds[0], bandKey: 'old' }],
    });
    await svc.putPricing(userId, show.id, {
      priceBands: [band('new', 200)],
      assignments: [{ sectionId: sectionIds[1], bandKey: 'new' }],
    });

    const bands = await db.select().from(priceBands).where(eq(priceBands.showId, show.id));
    const priced = await db
      .select()
      .from(showSectionPricing)
      .where(eq(showSectionPricing.showId, show.id));

    expect(bands.map((row) => row.name)).toEqual(['new']);
    expect(priced.map((row) => row.sectionId)).toEqual([sectionIds[1]]);
  });

  it('accepts an empty pricing, taking the show off sale entirely', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await svc.putPricing(userId, show.id, {
      priceBands: [band('old', 100)],
      assignments: [{ sectionId: sectionIds[0], bandKey: 'old' }],
    });
    await svc.putPricing(userId, show.id, { priceBands: [], assignments: [] });

    expect(await db.select().from(priceBands).where(eq(priceBands.showId, show.id))).toEqual([]);
  });

  it.each(['published', 'cancelled', 'finished'] as const)(
    'refuses to price a %s show',
    async (status) => {
      const { show, userId, sectionIds } = await seedDraft();
      await db.update(shows).set({ status }).where(eq(shows.id, show.id));

      await expect(
        svc.putPricing(userId, show.id, {
          priceBands: [band('vip', 100)],
          assignments: [{ sectionId: sectionIds[0], bandKey: 'vip' }],
        }),
      ).rejects.toThrow(ConflictException);
    },
  );

  it('rejects a section that belongs to a different venue', async () => {
    const { show, userId } = await seedDraft();
    const [elsewhere] = await db.insert(venues).values({ name: 'Some other hall' }).returning();
    const [foreign] = await db
      .insert(sections)
      .values({ venueId: elsewhere.id, name: 'Stalls' })
      .returning();

    await expect(
      svc.putPricing(userId, show.id, {
        priceBands: [band('vip', 100)],
        assignments: [{ sectionId: foreign.id, bandKey: 'vip' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects the same section twice — a clear 400 beats the primary key’s 23505', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await expect(
      svc.putPricing(userId, show.id, {
        priceBands: [band('a', 100), band('b', 200)],
        assignments: [
          { sectionId: sectionIds[0], bandKey: 'a' },
          { sectionId: sectionIds[0], bandKey: 'b' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an assignment naming a band that was not sent', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await expect(
      svc.putPricing(userId, show.id, {
        priceBands: [band('vip', 100)],
        assignments: [{ sectionId: sectionIds[0], bandKey: 'nope' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects two bands sharing a key, which would make the mapping ambiguous', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await expect(
      svc.putPricing(userId, show.id, {
        priceBands: [band('vip', 100), band('vip', 200)],
        assignments: [{ sectionId: sectionIds[0], bandKey: 'vip' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('leaves the existing pricing untouched when a later assignment is invalid', async () => {
    const { show, userId, sectionIds } = await seedDraft();
    await svc.putPricing(userId, show.id, {
      priceBands: [band('keep', 500)],
      assignments: [{ sectionId: sectionIds[0], bandKey: 'keep' }],
    });

    await expect(
      svc.putPricing(userId, show.id, {
        priceBands: [band('vip', 100)],
        assignments: [{ sectionId: UNKNOWN_ID, bandKey: 'vip' }],
      }),
    ).rejects.toThrow(BadRequestException);

    const bands = await db.select().from(priceBands).where(eq(priceBands.showId, show.id));
    expect(bands.map((row) => row.name)).toEqual(['keep']);
  });
});

describe('OrganizerPublishingService.publishChecklist', () => {
  it('reports a fully priced future show as ready, with its counts', async () => {
    const { show, userId, sectionIds } = await seedDraft();
    await svc.putPricing(userId, show.id, {
      priceBands: [band('flat', 2500)],
      assignments: sectionIds.map((sectionId) => ({ sectionId, bandKey: 'flat' })),
    });

    await expect(svc.publishChecklist(userId, show.id)).resolves.toEqual({
      hasPriceBands: true,
      hasPricedSections: true,
      startsInFuture: true,
      pricedSectionCount: 2,
      sectionCount: 2,
      // Two sections × one row × two seats.
      seatsOnSale: 4,
    });
  });

  it('reports an unpriced show as not ready', async () => {
    const { show, userId } = await seedDraft();

    await expect(svc.publishChecklist(userId, show.id)).resolves.toMatchObject({
      hasPriceBands: false,
      hasPricedSections: false,
      startsInFuture: true,
      pricedSectionCount: 0,
      sectionCount: 2,
      seatsOnSale: 0,
    });
  });

  it('counts only the sections actually on sale', async () => {
    const { show, userId, sectionIds } = await seedDraft();
    await svc.putPricing(userId, show.id, {
      priceBands: [band('flat', 2500)],
      assignments: [{ sectionId: sectionIds[0], bandKey: 'flat' }],
    });

    await expect(svc.publishChecklist(userId, show.id)).resolves.toMatchObject({
      pricedSectionCount: 1,
      sectionCount: 2,
      seatsOnSale: 2,
    });
  });

  it('reports a show that has already started as not startable', async () => {
    const { show, userId } = await seedDraft();
    await db
      .update(shows)
      .set({ startsAt: new Date(Date.now() - 86_400_000) })
      .where(eq(shows.id, show.id));

    await expect(svc.publishChecklist(userId, show.id)).resolves.toMatchObject({
      startsInFuture: false,
    });
  });
});

/** Puts a draft into the exact state `publishShow` demands. */
async function seedPublishable() {
  const draft = await seedDraft();

  await svc.putPricing(draft.userId, draft.show.id, {
    priceBands: [band('flat', 2500)],
    assignments: draft.sectionIds.map((sectionId) => ({ sectionId, bandKey: 'flat' })),
  });

  return draft;
}

const outboxFor = (routingKey: string) =>
  db.select().from(showsOutbox).where(eq(showsOutbox.routingKey, routingKey));

describe('OrganizerPublishingService.publishShow', () => {
  it('publishes the show and enqueues exactly one show.published message', async () => {
    const { show, userId } = await seedPublishable();

    await svc.publishShow(userId, show.id);

    const [published] = await db.select().from(shows).where(eq(shows.id, show.id));
    expect(published.status).toBe('published');

    const messages = await outboxFor('show.published');
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toMatchObject({ showId: show.id });
    expect(messages[0].publishedAt).toBeNull();
  });

  it('refuses to publish twice, and enqueues nothing the second time', async () => {
    const { show, userId } = await seedPublishable();
    await svc.publishShow(userId, show.id);

    await expect(svc.publishShow(userId, show.id)).rejects.toThrow(ConflictException);

    expect(await outboxFor('show.published')).toHaveLength(1);
  });

  it('refuses a show with no price bands, naming that reason', async () => {
    const { show, userId } = await seedDraft();

    await expect(svc.publishShow(userId, show.id)).rejects.toThrow(/price band/i);
  });

  it('refuses a show whose bands price no section', async () => {
    const { show, userId } = await seedDraft();
    await svc.putPricing(userId, show.id, {
      priceBands: [band('orphan', 100)],
      assignments: [],
    });

    await expect(svc.publishShow(userId, show.id)).rejects.toThrow(/section/i);
  });

  it('refuses a show that has already started', async () => {
    const { show, userId } = await seedPublishable();
    await db
      .update(shows)
      .set({ startsAt: new Date(Date.now() - 86_400_000) })
      .where(eq(shows.id, show.id));

    await expect(svc.publishShow(userId, show.id)).rejects.toThrow(/started/i);
  });

  it('enqueues nothing when the checklist fails', async () => {
    const { show, userId } = await seedDraft();

    await expect(svc.publishShow(userId, show.id)).rejects.toThrow(ConflictException);

    expect(await outboxFor('show.published')).toEqual([]);
  });
});

describe('OrganizerPublishingService.cancelShow', () => {
  it('cancels a published show and enqueues one show.cancelled message', async () => {
    const { show, userId } = await seedPublishable();
    await svc.publishShow(userId, show.id);

    await svc.cancelShow(userId, show.id);

    const [cancelled] = await db.select().from(shows).where(eq(shows.id, show.id));
    expect(cancelled.status).toBe('cancelled');

    const messages = await outboxFor('show.cancelled');
    expect(messages).toHaveLength(1);
    expect(messages[0].payload).toMatchObject({ showId: show.id });
  });

  it.each(['draft', 'cancelled', 'finished'] as const)(
    'refuses to cancel a %s show and enqueues nothing',
    async (status) => {
      const { show, userId } = await seedDraft();
      await db.update(shows).set({ status }).where(eq(shows.id, show.id));

      await expect(svc.cancelShow(userId, show.id)).rejects.toThrow(ConflictException);

      expect(await outboxFor('show.cancelled')).toEqual([]);
    },
  );
});

describe('OrganizerPublishingService.getPricing', () => {
  it('reads back what putPricing wrote, dearest band first', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await svc.putPricing(userId, show.id, {
      priceBands: [band('cheap', 1000), band('vip', 9000)],
      assignments: [
        { sectionId: sectionIds[0], bandKey: 'cheap' },
        { sectionId: sectionIds[1], bandKey: 'vip' },
      ],
    });

    const pricing = await svc.getPricing(userId, show.id);

    expect(pricing.priceBands.map((b) => [b.name, b.priceCents])).toEqual([
      ['vip', 9000],
      ['cheap', 1000],
    ]);

    // The assignment points at the band's real id — the write side's `key` is never persisted,
    // so a client that held one across this read would be holding a dead handle.
    const vip = pricing.priceBands.find((b) => b.name === 'vip');
    expect(pricing.assignments).toContainEqual({ sectionId: sectionIds[1], bandId: vip?.id });
  });

  it('returns empty arrays for a show nothing has priced yet', async () => {
    const { show, userId } = await seedDraft();

    expect(await svc.getPricing(userId, show.id)).toEqual({ priceBands: [], assignments: [] });
  });

  it('reads a published show too — the preview tab outlives the draft', async () => {
    const { show, userId, sectionIds } = await seedDraft();

    await svc.putPricing(userId, show.id, {
      priceBands: [band('vip', 9000)],
      assignments: [{ sectionId: sectionIds[0], bandKey: 'vip' }],
    });
    await db.update(shows).set({ status: 'published' }).where(eq(shows.id, show.id));

    expect((await svc.getPricing(userId, show.id)).priceBands).toHaveLength(1);
  });

  it('does not leak another show’s bands', async () => {
    const { show, userId, sectionIds } = await seedDraft();
    const other = await seedShowGraph(db, {
      show: { status: 'draft', startsAt: FUTURE },
      sections: [{ name: 'Only', rows: 1, seatsPerRow: 2 }],
      priceBand: false,
    });

    await svc.putPricing(userId, show.id, {
      priceBands: [band('mine', 100)],
      assignments: [{ sectionId: sectionIds[0], bandKey: 'mine' }],
    });
    await svc.putPricing(other.organizer.userId, other.show.id, {
      priceBands: [band('theirs', 200)],
      assignments: [{ sectionId: other.sections[0].section.id, bandKey: 'theirs' }],
    });

    const pricing = await svc.getPricing(userId, show.id);

    expect(pricing.priceBands.map((b) => b.name)).toEqual(['mine']);
    expect(pricing.assignments).toHaveLength(1);
  });
});

// The rule that stops an organizer probing for a competitor's show by id: a row that exists but
// is someone else's is indistinguishable from one that does not.
describe('ownership is a 404, never a 403', () => {
  const methods = [
    [
      'putPricing',
      (userId: string, showId: string) =>
        svc.putPricing(userId, showId, { priceBands: [], assignments: [] }),
    ],
    ['getPricing', (userId: string, showId: string) => svc.getPricing(userId, showId)],
    ['publishChecklist', (userId: string, showId: string) => svc.publishChecklist(userId, showId)],
    ['publishShow', (userId: string, showId: string) => svc.publishShow(userId, showId)],
    ['cancelShow', (userId: string, showId: string) => svc.cancelShow(userId, showId)],
  ] as const;

  it.each(methods)('%s rejects another organizer’s show with a 404', async (_name, call) => {
    const { show } = await seedDraft();
    const { organizer: stranger } = await seedShowGraph(db, { sections: [] });

    await expect(call(stranger.userId, show.id)).rejects.toThrow(NotFoundException);
  });

  it.each(methods)('%s rejects an unknown show id with a 404', async (_name, call) => {
    const { userId } = await seedDraft();

    await expect(call(userId, UNKNOWN_ID)).rejects.toThrow(NotFoundException);
  });

  it.each(methods)('%s rejects a user who is not an organizer with a 404', async (_name, call) => {
    const { show } = await seedDraft();
    const outsider = await seedUser(db);

    await expect(call(outsider.id, show.id)).rejects.toThrow(NotFoundException);
  });
});
