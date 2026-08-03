import {
  createShowSchema,
  organizerShowSchema,
  showSummarySchema,
  updateShowSchema,
  venueSummarySchema,
  type OrganizerShow,
  type VenueSummary,
} from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';
import { z } from 'zod';

export const showKeys = {
  all: ['shows'] as const,
  // The status lives in the URL and the route filters server-side, so it belongs in the key.
  list: (status?: string) => [...showKeys.all, 'list', status ?? 'all'] as const,
  byId: (showId: string) => [...showKeys.all, showId] as const,
};

/** Venues have no screen of their own — the catalogue is seeded and shared, and an organizer
 *  only ever picks from it. It lives here because the pickers are the new-show dialog and the
 *  show editor's seat map, both of which are this feature. */
export const venueKeys = {
  all: ['venues'] as const,
  list: () => [...venueKeys.all, 'list'] as const,
};

// Both list routes return a bare array, not a `{ items }` page — parsed as arrays rather than
// wrapped on the client to look like the buyer's `catalogPageSchema`.
export const organizerShowsSchema = z.array(organizerShowSchema);
const venuesSchema = z.array(venueSummarySchema);

/** Shared with `app/shows/page.tsx`, which prefetches this exact path through `serverApi`.
 *  One builder, so the server seed and the client refetch cannot drift apart. */
export function organizerShowsPath(status?: string): string {
  return `/organizer/shows${status ? `?status=${status}` : ''}`;
}

export function fetchOrganizerShows(status?: string): Promise<OrganizerShow[]> {
  return clientApi(organizerShowsPath(status), {}, organizerShowsSchema);
}

export function fetchVenues(): Promise<VenueSummary[]> {
  return clientApi('/organizer/venues', {}, venuesSchema);
}

export function createShow(input: unknown) {
  return clientApi(
    '/organizer/shows',
    { method: 'POST', body: createShowSchema.parse(input) },
    showSummarySchema,
  );
}

export function updateShow(showId: string, input: unknown) {
  return clientApi(
    `/organizer/shows/${showId}`,
    { method: 'PATCH', body: updateShowSchema.parse(input) },
    showSummarySchema,
  );
}

export function deleteShow(showId: string): Promise<void> {
  return clientApi(`/organizer/shows/${showId}`, { method: 'DELETE' });
}
