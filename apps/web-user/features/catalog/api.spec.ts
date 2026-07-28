import { afterEach, describe, expect, it, vi } from 'vitest';

import { CATALOG_PAGE_SIZE, catalogKeys, catalogPath, fetchCatalogPage } from './api';

const page = {
  items: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Demo Concert',
      startsAt: '2026-08-14T20:00:00.000Z',
      posterUrl: null,
      status: 'published',
    },
  ],
  nextCursor: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('catalogPath', () => {
  it('asks for a full page when there is no cursor', () => {
    expect(catalogPath()).toBe(`/shows?limit=${CATALOG_PAGE_SIZE}`);
  });

  it('carries the cursor for the next page', () => {
    expect(catalogPath('abc')).toBe(`/shows?limit=${CATALOG_PAGE_SIZE}&cursor=abc`);
  });
});

describe('catalogKeys', () => {
  it('namespaces the list under the feature key', () => {
    expect(catalogKeys.list()).toEqual(['catalog', 'list']);
  });
});

describe('fetchCatalogPage', () => {
  it('goes through the BFF proxy and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(page)),
    } as unknown as Response);

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCatalogPage()).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/gateway/shows?limit=${CATALOG_PAGE_SIZE}`);
  });

  it('rejects a page the contract does not recognise', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ items: [{ id: 'not-a-uuid' }] })),
      } as unknown as Response),
    );

    await expect(fetchCatalogPage()).rejects.toThrow();
  });
});
