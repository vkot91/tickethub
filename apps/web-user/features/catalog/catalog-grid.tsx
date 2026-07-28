'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { Button } from '@tickethub/ui';

import { catalogKeys, fetchCatalogPage } from './api';
import { ShowCard } from './show-card';

export function CatalogGrid() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: catalogKeys.list(),
    queryFn: ({ pageParam }) => fetchCatalogPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const shows = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold">All shows</h2>
        <span className="font-mono text-[13px] text-fg-faint">
          {shows.length} result{shows.length === 1 ? '' : 's'}
        </span>
      </div>

      {shows.length === 0 ? (
        <p className="text-sm text-fg-muted">No shows on sale right now. Check back soon.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4.5">
          {shows.map((show) => (
            <li key={show.id}>
              <ShowCard show={show} />
            </li>
          ))}
        </ul>
      )}

      {hasNextPage ? (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </>
  );
}
