import { catalogPageSchema, type CatalogPage } from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

export const CATALOG_PAGE_SIZE = 12;

export const catalogKeys = {
  all: ['catalog'] as const,
  list: () => [...catalogKeys.all, 'list'] as const,
};

export function catalogPath(cursor?: string): string {
  const params = new URLSearchParams({ limit: String(CATALOG_PAGE_SIZE) });

  if (cursor) params.set('cursor', cursor);

  return `/shows?${params}`;
}

export function fetchCatalogPage(cursor?: string): Promise<CatalogPage> {
  return clientApi(catalogPath(cursor), {}, catalogPageSchema);
}
