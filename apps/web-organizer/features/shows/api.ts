import { z } from 'zod';

import {
  createShowSchema,
  organizerShowSchema,
  posterUploadRequestSchema,
  posterUploadUrlSchema,
  publishChecklistSchema,
  putPricingSchema,
  showPricingSchema,
  showSummarySchema,
  updateShowSchema,
  venueDetailSchema,
  venueSummarySchema,
  type OrganizerShow,
  type PosterUploadUrl,
  type PublishChecklist,
  type ShowPricing,
  type VenueDetail,
  type VenueSummary,
} from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

export const showKeys = {
  all: ['shows'] as const,
  // The status lives in the URL and the route filters server-side, so it belongs in the key.
  list: (status?: string) => [...showKeys.all, 'list', status ?? 'all'] as const,
  byId: (showId: string) => [...showKeys.all, showId] as const,
  // Its own key rather than part of `byId`: the pricing PUT invalidates this without refetching
  // the show, and the preview tab reads it without caring about the show's title.
  pricing: (showId: string) => [...showKeys.byId(showId), 'pricing'] as const,
  // Never prefetched and never held: the checklist is stale the moment anything touches the
  // show, so the dialog fetches it on open and throws it away on close.
  checklist: (showId: string) => [...showKeys.byId(showId), 'checklist'] as const,
};

/** Venues have no screen of their own — the catalogue is seeded and shared, and an organizer
 *  only ever picks from it. It lives here because the pickers are the new-show dialog and the
 *  show editor's seat map, both of which are this feature. */
export const venueKeys = {
  all: ['venues'] as const,
  list: () => [...venueKeys.all, 'list'] as const,
  // Sections, rows and seats — the geometry the pricing tab counts and the preview tab draws.
  detail: (venueId: string) => [...venueKeys.all, venueId] as const,
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

export function fetchVenueDetail(venueId: string): Promise<VenueDetail> {
  return clientApi(`/organizer/venues/${venueId}`, {}, venueDetailSchema);
}

/** What the show is priced at today. Both pricing screens start here: an empty form saved over
 *  a priced show would wipe it, since `putPricing` replaces wholesale. */
export function fetchShowPricing(showId: string): Promise<ShowPricing> {
  return clientApi(`/organizer/shows/${showId}/pricing`, {}, showPricingSchema);
}

export function fetchPublishChecklist(showId: string): Promise<PublishChecklist> {
  return clientApi(`/organizer/shows/${showId}/publish-checklist`, {}, publishChecklistSchema);
}

/** No response schema, deliberately: `putPricing` is `Promise<void>` in `apps/shows`, so the
 *  gateway answers 200 with an empty body. Parsing that `null` against a schema throws *inside*
 *  the mutation, which skips `onSuccess` — nothing invalidates and the screen sits on stale data
 *  while the write has in fact succeeded. FE-2 shipped exactly that bug on `deleteShow`. */
export function putPricing(showId: string, input: unknown): Promise<void> {
  return clientApi(`/organizer/shows/${showId}/pricing`, {
    method: 'PUT',
    body: putPricingSchema.parse(input),
  });
}

/** Also `Promise<void>` — see `putPricing`. A 409 here names the checklist rule that failed and
 *  is meant to be read, not swallowed. */
export function publishShow(showId: string): Promise<void> {
  return clientApi(`/organizer/shows/${showId}/publish`, { method: 'POST' });
}
