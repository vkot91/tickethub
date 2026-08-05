import { vi } from 'vitest';

import {
  type OrganizerShow,
  type PublishChecklist,
  type ShowPricing,
  type VenueDetail,
  type VenueSummary,
} from '@tickethub/contracts';

/** Fixtures and the gateway stub shared by the organizer screens — dashboard and shows both
 *  read the same `/organizer/shows` list, so the mock lives at the feature root rather than in
 *  one screen. */

export const SHOW_ID = '11111111-1111-4111-8111-111111111111';
export const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
export const VENUE_ID = '33333333-3333-4333-8333-333333333333';

export const publishedShow: OrganizerShow = {
  id: SHOW_ID,
  title: 'Demo Concert',
  startsAt: '2026-08-14T20:00:00.000Z',
  posterUrl: null,
  status: 'published',
  venueId: VENUE_ID,
  venueName: 'Grand Hall',
  city: 'Berlin',
  description: 'A night of noise.\nSecond line nobody sees.',
  saleStartsAt: null,
  soldCount: 184,
  capacity: 480,
  revenueCents: 1_840_000,
};

export const draftShow: OrganizerShow = {
  id: DRAFT_ID,
  title: 'Neon Nights',
  startsAt: '2026-09-12T20:00:00.000Z',
  posterUrl: null,
  status: 'draft',
  venueId: VENUE_ID,
  venueName: 'Grand Hall',
  city: 'Berlin',
  description: 'Not on sale yet.',
  saleStartsAt: null,
  // Zero from `apps/shows` because the show has never been on sale — never rendered as `0`.
  soldCount: 0,
  capacity: 0,
  revenueCents: 0,
};

export const organizerShows: OrganizerShow[] = [publishedShow, draftShow];

export const OTHER_VENUE_ID = '44444444-4444-4444-8444-444444444444';

export const venues: VenueSummary[] = [
  { id: VENUE_ID, name: 'Grand Hall', address: '1 Main St', city: 'Berlin', seatCount: 480 },
  // A second hall, so "change the venue" is something a spec can actually do.
  { id: OTHER_VENUE_ID, name: 'Side Room', address: '2 Back St', city: 'Berlin', seatCount: 90 },
];

export const SECTION_A_ID = '66666666-6666-4666-8666-666666666666';
export const SECTION_B_ID = '77777777-7777-4777-8777-777777777777';
export const BAND_ID = '88888888-8888-4888-8888-888888888888';

/** One row per section, so a section's seat count is just the row's length — Parterre 4,
 *  Balcony 2, and every summary number in the pricing specs derives from those two. */
function section(id: string, name: string, seats: number): VenueDetail['sections'][number] {
  return {
    id,
    name,
    rows: [
      {
        id: `${id.slice(0, 8)}-0000-4000-8000-000000000000`,
        number: 1,
        seats: Array.from({ length: seats }, (_, i) => ({
          id: `${id.slice(0, 8)}-0000-4000-8000-00000000000${i}`,
          number: i + 1,
        })),
      },
    ],
  };
}

export const venueDetail: VenueDetail = {
  venue: { id: VENUE_ID, name: 'Grand Hall', address: '1 Main St', city: 'Berlin' },
  sections: [section(SECTION_A_ID, 'Parterre', 4), section(SECTION_B_ID, 'Balcony', 2)],
};

/** A show with nothing priced — the state a fresh draft is actually in. */
export const emptyPricing: ShowPricing = { ticketTypes: [], assignments: [] };

export const savedPricing: ShowPricing = {
  ticketTypes: [{ id: BAND_ID, name: 'Front VIP', tier: 'vip', priceCents: 9000 }],
  assignments: [{ sectionId: SECTION_A_ID, ticketTypeId: BAND_ID }],
};

export const readyChecklist: PublishChecklist = {
  hasTicketTypes: true,
  hasPricedSections: true,
  startsInFuture: true,
  pricedSectionCount: 1,
  sectionCount: 2,
  seatsOnSale: 4,
};

export const stats = {
  soldCount: 120,
  capacity: 400,
  revenueCents: 2_400_000,
  refundedCents: 100_000,
  checkedInCount: 64,
  // Named and tiered, as the gateway resolves them for a single show. Empty across "All shows" —
  // the card is hidden there rather than adding up different shows' bands that share a name.
  byTier: [{ ticketTypeId: BAND_ID, name: 'Front VIP', tier: 'vip' as const, soldCount: 90 }],
  byDay: [
    { date: '2026-08-01', revenueCents: 100_000, count: 4 },
    { date: '2026-08-02', revenueCents: 300_000, count: 11 },
  ],
};

export const recentOrders = {
  items: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      showTitle: 'Demo Concert',
      buyerEmail: 'buyer@example.com',
      seatLabels: ['A1', 'A2'],
      totalCents: 64000,
      status: 'paid',
      createdAt: '2026-08-01T18:00:00.000Z',
    },
  ],
};

/** Routes by URL — the dashboard fans out to three endpoints at once.
 *
 *  `body: undefined` means an empty response, which is not the same as `null` — it is what a
 *  handler returning `Promise<void>` actually puts on the wire (`200`, `Content-Length: 0`). */
export function mockGateway(overrides: Record<string, { status: number; body?: unknown }> = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url).replace('/api/gateway', '');

    // Longest key wins, so an override for `/organizer/shows/:id` does not also swallow that
    // show's `/pricing` and `/publish-checklist` — both of which start with it.
    const match =
      Object.entries(overrides)
        .filter(([key]) => path.startsWith(key))
        .sort(([a], [b]) => b.length - a.length)[0]?.[1] ??
      // DELETE is `Promise<void>` in `ShowsService` — 200 with nothing in it, for both the
      // delete-a-draft and the cancel-a-published-show branch.
      // `putPricing` and `publish` are `Promise<void>` in `apps/shows` too, so they answer with
      // nothing at all. A fixture that returned a convenient object here would hide the bug
      // where a response schema parses that empty body and throws inside the mutation.
      (init?.method === 'DELETE' || init?.method === 'PUT'
        ? { status: 200, body: undefined }
        : init?.method === 'POST' && path.endsWith('/publish')
          ? { status: 200, body: undefined }
          : init?.method === 'PATCH' || init?.method === 'POST'
            ? { status: 200, body: publishedShow }
            : path.endsWith('/publish-checklist')
              ? { status: 200, body: readyChecklist }
              : path.endsWith('/pricing')
                ? { status: 200, body: emptyPricing }
                : // A single venue, not the catalogue: `/organizer/venues/:id` is a VenueDetail.
                  path.startsWith('/organizer/venues/')
                  ? { status: 200, body: venueDetail }
                  : path.startsWith('/organizer/venues')
                    ? { status: 200, body: venues }
                    : path.startsWith('/organizer/shows')
                      ? { status: 200, body: organizerShows }
                      : path.startsWith('/organizer/stats')
                        ? { status: 200, body: stats }
                        : { status: 200, body: recentOrders });

    return Promise.resolve({
      ok: match.status < 400,
      status: match.status,
      statusText: 'Error',
      text: () => Promise.resolve(match.body === undefined ? '' : JSON.stringify(match.body)),
    } as unknown as Response);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}
