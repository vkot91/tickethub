import {
  catalogPageSchema,
  checkInResultSchema,
  checkInSchema,
  createShowSchema,
  recentOrdersSchema,
  showStatsSchema,
  showSummarySchema,
  updateShowSchema,
  type CheckInDto,
  type CheckInResult,
  type ShowStats,
} from '@tickethub/contracts';

// Re-exported so the scanner screens keep importing their shapes from one place. The schemas
// themselves live in contracts — a local copy is how the union quietly lost its fourth result.
export type { CheckInDto, CheckInResult };

import { clientApi } from '@tickethub/web-kit';

export const organizerKeys = {
  all: ['organizer'] as const,
  shows: () => [...organizerKeys.all, 'shows'] as const,
  stats: (showId: string) => [...organizerKeys.all, 'stats', showId] as const,
  recentOrders: () => [...organizerKeys.all, 'recent-orders'] as const,
};

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

/** `showId` is the gate — the show whose door is being scanned, not just any show you own. */
export function checkIn(scan: CheckInDto): Promise<CheckInResult> {
  return clientApi(
    '/organizer/check-in',
    { method: 'POST', body: checkInSchema.parse(scan) },
    checkInResultSchema,
  );
}
