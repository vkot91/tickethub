import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { organizers, shows, showSectionPricing, ticketTypes, venues, type Db } from '@tickethub/db';
import type {
  CreateShowDto,
  OrganizerShow,
  OrganizerShowsQuery,
  UpdateShowDto,
} from '@tickethub/contracts';
import { OrganizerPublishingService } from './publishing.service';

/**
 * Which fields an edit may touch, per status. A published show's building and start time are
 * printed on tickets people already hold, so they stop being editable the moment it goes on sale;
 * a cancelled or finished one is history. A field outside the list is a 409, never a silent drop —
 * ignoring a venue change the UI thought it made is how a show sells the wrong building.
 */
const EDITABLE_BY_STATUS: Record<string, readonly string[]> = {
  draft: ['title', 'description', 'venueId', 'startsAt', 'posterUrl', 'saleStartsAt'],
  published: ['title', 'description', 'posterUrl', 'saleStartsAt'],
  cancelled: [],
  finished: [],
};

const UNIQUE_VIOLATION = '23505';

/** One row of `selectShows`, before the timestamps and the sales numbers are shaped. */
interface ShowRow extends Omit<
  OrganizerShow,
  'startsAt' | 'saleStartsAt' | 'soldCount' | 'capacity' | 'revenueCents'
> {
  startsAt: Date;
  saleStartsAt: Date | null;
}

const toOrganizerShow = (show: ShowRow): OrganizerShow => ({
  ...show,
  startsAt: show.startsAt.toISOString(),
  saleStartsAt: show.saleStartsAt?.toISOString() ?? null,
  // Sales live in `apps/orders`; the gateway merges the real numbers in from slice 6. Zero rather
  // than omitted, so the contract is the same shape before and after.
  soldCount: 0,
  capacity: 0,
  revenueCents: 0,
});

/**
 * An organizer's own shows — every status, no publication filter, always scoped to the caller.
 * The buyer-facing catalog reads live in `user/shows.service.ts` and share nothing but the db.
 */
@Injectable()
export class OrganizerShowsService {
  constructor(
    private readonly db: Db,
    private readonly publishing: OrganizerPublishingService,
  ) {}

  /**
   * The single mechanism by which orders, fulfillment and the gateway fan-outs learn what an
   * organizer owns. Empty for a user who has never authored anything.
   */
  async showIds(userId: string): Promise<string[]> {
    const owned = await this.db
      .select({ id: shows.id })
      .from(shows)
      .innerJoin(organizers, eq(organizers.id, shows.organizerId))
      .where(eq(organizers.userId, userId));

    return owned.map((show) => show.id);
  }

  async myShows(userId: string, query: OrganizerShowsQuery = {}): Promise<OrganizerShow[]> {
    const organizerId = await this.organizerIdFor(userId);

    const scope = query.status
      ? and(eq(shows.organizerId, organizerId), eq(shows.status, query.status))
      : eq(shows.organizerId, organizerId);

    const listed = await this.selectShows(scope).orderBy(desc(shows.startsAt));

    return listed.map(toOrganizerShow);
  }

  async createShow(userId: string, dto: CreateShowDto): Promise<OrganizerShow> {
    const organizerId = await this.organizerIdFor(userId);

    await this.assertVenueExists(dto.venueId);

    const [created] = await this.mappingTitleConflict(() =>
      this.db
        .insert(shows)
        .values({
          organizerId,
          venueId: dto.venueId,
          title: dto.title,
          description: dto.description,
          startsAt: new Date(dto.startsAt),
          status: 'draft',
        })
        .returning({ id: shows.id }),
    );

    return this.one(created.id);
  }

  async updateShow(userId: string, showId: string, dto: UpdateShowDto): Promise<OrganizerShow> {
    const organizerId = await this.organizerIdFor(userId);

    const show = await this.ownedShow(organizerId, showId);

    const editable = EDITABLE_BY_STATUS[show.status];
    const rejected = Object.keys(dto).filter((field) => !editable.includes(field));

    if (rejected.length > 0) {
      throw new ConflictException(`Cannot change ${rejected.join(', ')} on a ${show.status} show`);
    }

    const movingVenue = dto.venueId !== undefined && dto.venueId !== show.venueId;

    if (dto.venueId !== undefined) await this.assertVenueExists(dto.venueId);

    const patch = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.venueId !== undefined && { venueId: dto.venueId }),
      ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
      ...(dto.posterUrl !== undefined && { posterUrl: dto.posterUrl }),
      ...(dto.saleStartsAt !== undefined && {
        saleStartsAt: dto.saleStartsAt === null ? null : new Date(dto.saleStartsAt),
      }),
    };

    await this.mappingTitleConflict(() =>
      this.db.transaction(async (tx) => {
        // The old sections are in a different building — the composite FK would reject them
        // anyway, so dropping them here makes the data loss intentional and testable.
        if (movingVenue) {
          await tx.delete(showSectionPricing).where(eq(showSectionPricing.showId, showId));
        }

        await tx.update(shows).set(patch).where(eq(shows.id, showId));
      }),
    );

    return this.one(showId);
  }

  /**
   * Delete or cancel, decided here rather than by the caller — the status has to be read and acted
   * on in one place, or the client picks its verb from a status that has since moved on. A draft
   * never sold anything and is removed; a published show is cancelled and kept, because people
   * hold tickets to it and `apps/orders` refunds them off the event.
   */
  async deleteShow(userId: string, showId: string): Promise<void> {
    const organizerId = await this.organizerIdFor(userId);

    const show = await this.ownedShow(organizerId, showId);

    if (show.status === 'published') return this.publishing.cancelShow(userId, showId);

    if (show.status !== 'draft') throw new ConflictException(`Cannot delete a ${show.status} show`);

    await this.db.transaction(async (tx) => {
      await tx.delete(showSectionPricing).where(eq(showSectionPricing.showId, showId));
      await tx.delete(ticketTypes).where(eq(ticketTypes.showId, showId));
      await tx.delete(shows).where(eq(shows.id, showId));
    });
  }

  /**
   * 404, not 403: an organizer must not be able to probe for a competitor's show by id, so a row
   * that exists but belongs to someone else is indistinguishable from one that does not.
   */
  private async ownedShow(organizerId: string, showId: string) {
    const [show] = await this.db
      .select({ id: shows.id, status: shows.status, venueId: shows.venueId })
      .from(shows)
      .where(and(eq(shows.id, showId), eq(shows.organizerId, organizerId)))
      .limit(1);

    if (!show) throw new NotFoundException('Show not found');

    return show;
  }

  private async organizerIdFor(userId: string): Promise<string> {
    const [organizer] = await this.db
      .select({ id: organizers.id })
      .from(organizers)
      .where(eq(organizers.userId, userId))
      .limit(1);

    if (!organizer) throw new NotFoundException('Organizer not found');

    return organizer.id;
  }

  // Venues are a shared catalogue (`0002_venues_are_shared`), so there is no ownership to check
  // here — only that the hall exists.
  private async assertVenueExists(venueId: string): Promise<void> {
    const [venue] = await this.db
      .select({ id: venues.id })
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);

    if (!venue) throw new NotFoundException('Venue not found');
  }

  /**
   * `shows_venue_title_slot_uq` is the only unique constraint a show write can trip. The message is
   * deliberately impersonal: the show holding the slot may be another organizer's, since the
   * constraint is scoped to the venue rather than the caller.
   */
  private async mappingTitleConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('This venue already has a show with this title at this time');
      }

      throw err;
    }
  }

  private async one(showId: string): Promise<OrganizerShow> {
    const [show] = await this.selectShows(eq(shows.id, showId)).limit(1);

    return toOrganizerShow(show);
  }

  /**
   * The one place the joined organizer shape is selected. Unsorted and unlimited — the caller adds
   * whatever ordering it needs, so a single-row read does not carry a list's ORDER BY.
   */
  private selectShows(scope: SQL | undefined) {
    return this.db
      .select({
        id: shows.id,
        title: shows.title,
        startsAt: shows.startsAt,
        posterUrl: shows.posterUrl,
        status: shows.status,
        venueId: venues.id,
        venueName: venues.name,
        city: venues.city,
        description: shows.description,
        saleStartsAt: shows.saleStartsAt,
      })
      .from(shows)
      .innerJoin(venues, eq(venues.id, shows.venueId))
      .where(scope);
  }
}
