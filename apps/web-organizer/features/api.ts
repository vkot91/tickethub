import {
  catalogPageSchema,
  createShowSchema,
  recentOrdersSchema,
  showStatsSchema,
  showSummarySchema,
  updateShowSchema,
  type ShowStats,
} from '@tickethub/contracts';
import { z } from 'zod';

import { clientApi } from '@tickethub/web-kit';

export const organizerKeys = {
  all: ['organizer'] as const,
  shows: () => [...organizerKeys.all, 'shows'] as const,
  stats: (showId: string) => [...organizerKeys.all, 'stats', showId] as const,
  recentOrders: () => [...organizerKeys.all, 'recent-orders'] as const,
};

/** The scanner holds the QR's HMAC token, not a ticket id, so check-in is keyed by code. */
export const checkInSchema = z.object({ code: z.string().min(1) });

export const checkInResultSchema = z.object({
  result: z.enum(['valid', 'used', 'invalid']),
  seatLabel: z.string().nullable(),
  showTitle: z.string().nullable(),
  checkedInAt: z.string().nullable(),
  checkedInCount: z.number().int(),
  capacity: z.number().int(),
});
export type CheckInResult = z.infer<typeof checkInResultSchema>;

export function fetchOrganizerShows() {
  return clientApi('/shows?organizer=me', {}, catalogPageSchema);
}

export function fetchShowStats(showId: string): Promise<ShowStats> {
  return clientApi(`/shows/${showId}/stats`, {}, showStatsSchema);
}

export function fetchRecentOrders() {
  return clientApi('/orders/recent', {}, recentOrdersSchema);
}

export function createShow(input: unknown) {
  return clientApi(
    '/shows',
    { method: 'POST', body: createShowSchema.parse(input) },
    showSummarySchema,
  );
}

export function updateShow(showId: string, input: unknown) {
  return clientApi(
    `/shows/${showId}`,
    { method: 'PATCH', body: updateShowSchema.parse(input) },
    showSummarySchema,
  );
}

/** A soft cancel — the backend fans out refunds via `show.cancelled` rather than deleting. */
export function cancelShow(showId: string) {
  return clientApi(`/shows/${showId}`, { method: 'DELETE' }, showSummarySchema);
}

export function checkIn(code: string): Promise<CheckInResult> {
  return clientApi('/tickets/check-in', { method: 'POST', body: { code } }, checkInResultSchema);
}
