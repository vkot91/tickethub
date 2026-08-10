import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockGateway, SHOW_ID, VENUE_ID } from '../test-gateway';
import {
  deleteShow,
  organizerShowPath,
  organizerShowsPath,
  publishShow,
  putPricing,
  showKeys,
  venueKeys,
} from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shows api keys', () => {
  it('keys a list by its status, so a filtered list is not served from the all-shows cache', () => {
    expect(showKeys.list('draft')).toEqual(['shows', 'list', 'draft']);
    expect(showKeys.list()).toEqual(['shows', 'list', 'all']);
  });

  it('nests every show key under `all`, so one invalidate covers all filters', () => {
    expect(showKeys.list('draft').slice(0, 1)).toEqual([...showKeys.all]);
    expect(showKeys.byId(SHOW_ID)).toEqual(['shows', SHOW_ID]);
  });

  it('keys venues separately — they outlive any one show', () => {
    expect(venueKeys.list()).toEqual(['venues', 'list']);
    expect(venueKeys.detail(VENUE_ID)).toEqual(['venues', VENUE_ID]);
  });

  // Both hang off `byId`, so invalidating a show's key covers its pricing and its checklist —
  // which is what a successful publish needs.
  it('nests pricing and the checklist under the show they belong to', () => {
    expect(showKeys.pricing(SHOW_ID)).toEqual(['shows', SHOW_ID, 'pricing']);
    expect(showKeys.checklist(SHOW_ID)).toEqual(['shows', SHOW_ID, 'checklist']);
  });
});

// The page prefetches `organizerShowsPath(status)` on the server under `showKeys.list(status)`,
// and the screen refetches the same pair on the client. If the two drift, the seed silently
// misses and every load quietly fetches twice.
describe('organizerShowsPath', () => {
  it('omits the query string entirely when no status is filtered', () => {
    expect(organizerShowsPath()).toBe('/organizer/shows');
  });

  it('carries the status the query key was built from', () => {
    expect(organizerShowsPath('draft')).toBe('/organizer/shows?status=draft');
  });

  // Same pairing for the editor: `app/shows/[id]/edit/page.tsx` seeds `showKeys.byId(id)` with
  // this path, and `ShowEditor` reads the same pair back.
  it('builds the single-show path the editor prefetches', () => {
    expect(organizerShowPath(SHOW_ID)).toBe(`/organizer/shows/${SHOW_ID}`);
  });
});

// The same empty-body trap as `deleteShow`, twice over. Both handlers are `Promise<void>` in
// `apps/shows`, so a response schema on either would throw inside the mutation and skip
// `onSuccess` — the write lands, nothing invalidates, and the screen sits on stale data.
describe('the void routes resolve on an empty body', () => {
  it('accepts what putPricing actually returns', async () => {
    mockGateway();

    await expect(putPricing(SHOW_ID, { priceBands: [], assignments: [] })).resolves.not.toThrow();
  });

  it('accepts what publishShow actually returns', async () => {
    mockGateway();

    await expect(publishShow(SHOW_ID)).resolves.not.toThrow();
  });

  it('rejects a malformed pricing body before it is sent', () => {
    const fetchMock = mockGateway();

    // Throws where it is called, not on the returned promise: the parse happens before the
    // request is built, which is the point — a negative price never reaches the gateway.
    expect(() =>
      putPricing(SHOW_ID, {
        priceBands: [{ key: 'k', name: 'n', tier: 'vip', priceCents: -1 }],
        assignments: [],
      }),
    ).toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('deleteShow', () => {
  it('resolves on the empty body the route actually returns', async () => {
    mockGateway();

    await expect(deleteShow(SHOW_ID)).resolves.not.toThrow();
  });
});
