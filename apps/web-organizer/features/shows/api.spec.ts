import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteShow, organizerShowsPath, showKeys, venueKeys } from './api';
import { mockGateway, SHOW_ID } from '../test-gateway';

afterEach(() => {
  vi.unstubAllGlobals();
});

// `updateShowSchema` now lives in `@tickethub/contracts` and is tested there.
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
});

describe('deleteShow', () => {
  // `ShowsService.deleteShow` is `Promise<void>`, so the gateway answers 200 with an empty body.
  // Parsing that against a schema rejected the mutation, which skipped `onSuccess` — the list was
  // never invalidated and the deleted row stayed on screen until a reload.
  it('resolves on the empty body the route actually returns', async () => {
    mockGateway();

    await expect(deleteShow(SHOW_ID)).resolves.not.toThrow();
  });
});
