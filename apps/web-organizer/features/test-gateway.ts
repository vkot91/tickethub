import { vi } from 'vitest';

/** Fixtures and the gateway stub shared by the organizer screens — dashboard and shows both
 *  read the same `/shows` list, so the mock lives at the feature root rather than in one screen. */

export const SHOW_ID = '11111111-1111-4111-8111-111111111111';

export const shows = {
  items: [
    {
      id: SHOW_ID,
      title: 'Demo Concert',
      startsAt: '2026-08-14T20:00:00.000Z',
      posterUrl: null,
      status: 'published',
    },
  ],
  nextCursor: null,
};

export const stats = {
  soldCount: 120,
  capacity: 400,
  revenueCents: 2_400_000,
  refundedCents: 100_000,
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
    },
  ],
};

/** Routes by URL — the dashboard fans out to three endpoints at once. */
export function mockGateway(overrides: Record<string, { status: number; body: unknown }> = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const path = String(url).replace('/api/gateway', '');

    const match =
      Object.entries(overrides).find(([key]) => path.startsWith(key))?.[1] ??
      (init?.method === 'DELETE' || init?.method === 'PATCH' || init?.method === 'POST'
        ? { status: 200, body: shows.items[0] }
        : path.startsWith('/shows/')
          ? { status: 200, body: stats }
          : path.startsWith('/shows')
            ? { status: 200, body: shows }
            : { status: 200, body: recentOrders });

    return Promise.resolve({
      ok: match.status < 400,
      status: match.status,
      statusText: 'Error',
      text: () => Promise.resolve(JSON.stringify(match.body)),
    } as unknown as Response);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}
