import { z } from 'zod';

import {
  createShowSchema,
  organizerShowSchema,
  posterUploadRequestSchema,
  posterUploadUrlSchema,
  showSummarySchema,
  updateShowSchema,
  venueSummarySchema,
  type OrganizerShow,
  type PosterUploadUrl,
  type VenueSummary,
} from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

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

/** The editor's own path builder, shared with `app/shows/[id]/edit/page.tsx`'s prefetch for the
 *  same reason as the list's: the seed and the client refetch must not drift. */
export function organizerShowPath(showId: string): string {
  return `/organizer/shows/${showId}`;
}

export function fetchOrganizerShow(showId: string): Promise<OrganizerShow> {
  return clientApi(organizerShowPath(showId), {}, organizerShowSchema);
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

/** Step one of three. The file itself never comes through here — the browser PUTs it straight to
 *  MinIO with the URL this returns, then PATCHes the `posterUrl` that comes back with it. */
export function createPosterUploadUrl(
  showId: string,
  contentType: string,
): Promise<PosterUploadUrl> {
  return clientApi(
    `/organizer/shows/${showId}/poster-upload-url`,
    { method: 'POST', body: posterUploadRequestSchema.parse({ contentType }) },
    posterUploadUrlSchema,
  );
}

export function deleteShow(showId: string): Promise<void> {
  return clientApi(`/organizer/shows/${showId}`, { method: 'DELETE' });
}
