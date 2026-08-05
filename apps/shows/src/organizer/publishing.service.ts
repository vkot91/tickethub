import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  organizers,
  rows,
  seats,
  sections,
  shows,
  showSectionPricing,
  priceBands,
  type Db,
} from '@tickethub/db';
import { OutboxRepository, type Tx } from '@tickethub/outbox';
import {
  SHOW_ROUTING_KEYS,
  type PublishChecklist,
  type PutPricingDto,
  type ShowPricing,
} from '@tickethub/contracts';

/** The show as the publishing rules need it — status to gate on, venue to pin pricing to. */
interface OwnedShow {
  id: string;
  venueId: string;
  status: string;
  startsAt: Date;
}

/**
 * Why a draft cannot go on sale yet, in the order the organizer should fix them. Checked
 * server-side on every publish: the popover's copy of this is a convenience, never the gate.
 */
const CHECKLIST_FAILURES = [
  ['hasPriceBands', 'Add at least one price band before publishing'],
  ['hasPricedSections', 'Assign at least one section to a price band before publishing'],
  ['startsInFuture', 'A show that has already started cannot be published'],
] as const satisfies readonly (readonly [keyof PublishChecklist, string])[];

/**
 * Taking a show from draft to on-sale, and back off it. Every status change here commits with its
 * outbox message in one transaction — `apps/orders` mass-refunds on `show.cancelled`, so a
 * cancellation that failed to emit would leave people holding tickets to nothing.
 */
@Injectable()
export class OrganizerPublishingService {
  constructor(
    private readonly db: Db,
    private readonly outbox: OutboxRepository,
  ) {}

  /**
   * Wholesale replace of the show's price bands and which sections they cover. Draft only: once a
   * show is on sale a reservation may reference a band, and there is no safe way to delete it.
   */
  async putPricing(userId: string, showId: string, dto: PutPricingDto): Promise<void> {
    const show = await this.ownedShow(userId, showId);

    if (show.status !== 'draft') {
      throw new ConflictException(`Cannot change pricing on a ${show.status} show`);
    }

    const idByKey = new Map(dto.priceBands.map((band) => [band.key, '']));

    if (idByKey.size !== dto.priceBands.length) {
      throw new BadRequestException('Two price bands share the same key');
    }

    const sectionIds = new Set<string>();

    for (const assignment of dto.assignments) {
      if (sectionIds.has(assignment.sectionId)) {
        throw new BadRequestException(`Section ${assignment.sectionId} is priced twice`);
      }

      if (!idByKey.has(assignment.bandKey)) {
        throw new BadRequestException(`No price band with key ${assignment.bandKey}`);
      }

      sectionIds.add(assignment.sectionId);
    }

    await this.assertSectionsOfVenue(show.venueId, [...sectionIds]);

    await this.db.transaction(async (tx) => {
      // Safe in draft and only in draft: nothing was ever on sale, so no reservation can point at
      // a band we are about to delete.
      await tx.delete(showSectionPricing).where(eq(showSectionPricing.showId, showId));
      await tx.delete(priceBands).where(eq(priceBands.showId, showId));

      if (dto.priceBands.length === 0) return;

      // Postgres returns a multi-row INSERT in the order of its VALUES list, which is what lets
      // the client-side `key` line up with the id it just got.
      const inserted = await tx
        .insert(priceBands)
        .values(
          dto.priceBands.map((band) => ({
            showId,
            name: band.name,
            tier: band.tier,
            priceCents: band.priceCents,
          })),
        )
        .returning({ id: priceBands.id });

      dto.priceBands.forEach((band, i) => idByKey.set(band.key, inserted[i].id));

      if (dto.assignments.length === 0) return;

      await tx.insert(showSectionPricing).values(
        dto.assignments.map((assignment) => ({
          showId,
          sectionId: assignment.sectionId,
          // From the show, never from the request: this column is what pins both composite FKs to
          // one building, so a request that could name its own venue would defeat them.
          venueId: show.venueId,
          bandId: idByKey.get(assignment.bandKey) ?? '',
        })),
      );
    });
  }

  /**
   * The read side of `putPricing`. Not gated on draft: the console's preview tab renders a
   * published show's pricing too, and this returns nothing a buyer could not already see.
   */
  async getPricing(userId: string, showId: string): Promise<ShowPricing> {
    const show = await this.ownedShow(userId, showId);

    const bands = await this.db
      .select({
        id: priceBands.id,
        name: priceBands.name,
        tier: priceBands.tier,
        priceCents: priceBands.priceCents,
      })
      .from(priceBands)
      .where(eq(priceBands.showId, show.id))
      // Dearest first, matching the public show page. `name` breaks the tie so two bands at the
      // same price do not swap places between reads and shuffle the form under the organizer.
      .orderBy(desc(priceBands.priceCents), priceBands.name);

    const assignments = await this.db
      .select({
        sectionId: showSectionPricing.sectionId,
        bandId: showSectionPricing.bandId,
      })
      .from(showSectionPricing)
      .where(eq(showSectionPricing.showId, show.id));

    return { priceBands: bands, assignments };
  }

  async publishChecklist(userId: string, showId: string): Promise<PublishChecklist> {
    return this.checklistFor(await this.ownedShow(userId, showId));
  }

  async publishShow(userId: string, showId: string): Promise<void> {
    const show = await this.ownedShow(userId, showId);
    const checklist = await this.checklistFor(show);
    const failure = CHECKLIST_FAILURES.find(([flag]) => !checklist[flag]);

    if (failure) throw new ConflictException(failure[1]);

    await this.transition(showId, 'draft', 'published', SHOW_ROUTING_KEYS.SHOW_PUBLISHED, userId);
  }

  /**
   * The published branch of `deleteShow`. Never deletes the row — people hold tickets to it, and
   * `apps/orders` needs the show to still exist while it refunds them.
   */
  async cancelShow(userId: string, showId: string): Promise<void> {
    await this.ownedShow(userId, showId);

    await this.transition(
      showId,
      'published',
      'cancelled',
      SHOW_ROUTING_KEYS.SHOW_CANCELLED,
      userId,
    );
  }

  /**
   * The conditional UPDATE is the concurrency guard: two publishes racing both re-read a draft,
   * but only one of them updates a row, so only one enqueues a message.
   */
  private async transition(
    showId: string,
    from: 'draft' | 'published',
    to: 'published' | 'cancelled',
    routingKey: typeof SHOW_ROUTING_KEYS.SHOW_PUBLISHED | typeof SHOW_ROUTING_KEYS.SHOW_CANCELLED,
    userId: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const moved = await tx
        .update(shows)
        .set({ status: to })
        .where(and(eq(shows.id, showId), eq(shows.status, from)))
        .returning({ id: shows.id });

      if (moved.length === 0) {
        const current = await this.ownedShow(userId, showId, tx);

        throw new ConflictException(
          `Cannot ${to === 'published' ? 'publish' : 'cancel'} a ${current.status} show`,
        );
      }

      await this.outbox.enqueue(tx, { routingKey, payload: { showId } });
    });
  }

  private async checklistFor(show: OwnedShow): Promise<PublishChecklist> {
    const [bands] = await this.db
      .select({ n: count() })
      .from(priceBands)
      .where(eq(priceBands.showId, show.id));

    const [priced] = await this.db
      .select({ n: count() })
      .from(showSectionPricing)
      .where(eq(showSectionPricing.showId, show.id));

    const [venueSections] = await this.db
      .select({ n: count() })
      .from(sections)
      .where(eq(sections.venueId, show.venueId));

    // Seats in priced sections only — the number the organizer is about to put on sale, not the
    // hall's capacity.
    const [onSale] = await this.db
      .select({ n: count() })
      .from(showSectionPricing)
      .innerJoin(rows, eq(rows.sectionId, showSectionPricing.sectionId))
      .innerJoin(seats, eq(seats.rowId, rows.id))
      .where(eq(showSectionPricing.showId, show.id));

    return {
      hasPriceBands: bands.n > 0,
      hasPricedSections: priced.n > 0,
      startsInFuture: show.startsAt.getTime() > Date.now(),
      pricedSectionCount: priced.n,
      sectionCount: venueSections.n,
      seatsOnSale: onSale.n,
    };
  }

  /**
   * 404, not 403: an organizer must not be able to probe for a competitor's show by id, so a row
   * that exists but belongs to someone else is indistinguishable from one that does not. The join
   * makes "not an organizer at all" the same answer, for the same reason.
   */
  private async ownedShow(userId: string, showId: string, tx: Db | Tx = this.db) {
    const [show] = await tx
      .select({
        id: shows.id,
        venueId: shows.venueId,
        status: shows.status,
        startsAt: shows.startsAt,
      })
      .from(shows)
      .innerJoin(organizers, eq(organizers.id, shows.organizerId))
      .where(and(eq(shows.id, showId), eq(organizers.userId, userId)))
      .limit(1);

    if (!show) throw new NotFoundException('Show not found');

    return show;
  }

  // The composite FKs would reject a foreign section anyway; catching it here turns a 23505 into a
  // message that names the section.
  private async assertSectionsOfVenue(venueId: string, sectionIds: string[]): Promise<void> {
    if (sectionIds.length === 0) return;

    const belonging = await this.db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.venueId, venueId), inArray(sections.id, sectionIds)));

    const known = new Set(belonging.map((section) => section.id));
    const foreign = sectionIds.filter((id) => !known.has(id));

    if (foreign.length > 0) {
      throw new BadRequestException(`Not a section of this show’s venue: ${foreign.join(', ')}`);
    }
  }
}
