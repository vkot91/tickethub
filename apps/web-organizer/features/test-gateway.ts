import { type OrganizerShow, type VenueSummary } from '@tickethub/contracts';
import { vi } from 'vitest';

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

export const venues: VenueSummary[] = [
  { id: VENUE_ID, name: 'Grand Hall', address: '1 Main St', city: 'Berlin', seatCount: 480 },
];

export const stats = {
  soldCount: 120,
  capacity: 400,
  revenueCents: 2_400_000,
  refundedCents: 100_000,
  checkedInCount: 64,
  byTier: [],
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

    const match =
      Object.entries(overrides).find(([key]) => path.startsWith(key))?.[1] ??
      // DELETE is `Promise<void>` in `ShowsService` — 200 with nothing in it, for both the
      // delete-a-draft and the cancel-a-published-show branch.
      (init?.method === 'DELETE'
        ? { status: 200, body: undefined }
        : init?.method === 'PATCH' || init?.method === 'POST'
          ? { status: 200, body: publishedShow }
          : path.startsWith('/organizer/venues')
            ? { status: 200, body: venues }
            : path.startsWith('/organizer/shows')
              ? { status: 200, body: organizerShows }
              : path.startsWith('/shows/')
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
