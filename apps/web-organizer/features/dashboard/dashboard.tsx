'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button, Select, Skeleton } from '@tickethub/ui';
import { ApiError } from '@tickethub/web-kit';

import { fetchShowNames, showKeys } from '../shows/api';
import {
  dashboardKeys,
  DEFAULT_RANGE,
  fetchRecentOrders,
  fetchShowStats,
  fromFor,
  isRange,
  RANGES,
  type Range,
} from './api';
import { PriceBandsCard } from './price-bands-card';
import { RecentOrdersTable } from './recent-orders-table';
import { RevenueChart } from './revenue-chart';
import { StatCards } from './stat-cards';

/** Radix Select has no empty value, so the all-shows scope needs a sentinel rather than `''`. */
const ALL_SHOWS = 'all';

interface DashboardProps {
  /** Both come from `?showId=` / `?range=`, so the view is linkable and survives a refresh. */
  showId?: string;
  range?: string;
}

export function Dashboard({ showId: initialShowId, range: initialRange }: DashboardProps) {
  const router = useRouter();

  const [showId, setShowId] = useState(initialShowId);
  const [range, setRange] = useState<Range>(isRange(initialRange) ? initialRange : DEFAULT_RANGE);

  const from = fromFor(range);

  // `router.replace` rather than a `<Link>`: the screen already holds the selection, and a
  // navigation would re-run the page's prefetch to arrive at the state it is already in.
  function select(nextShowId: string | undefined, nextRange: Range) {
    setShowId(nextShowId);
    setRange(nextRange);

    const query = new URLSearchParams();

    if (nextShowId) query.set('showId', nextShowId);
    if (nextRange !== DEFAULT_RANGE) query.set('range', nextRange);

    router.replace(query.size > 0 ? `/?${query}` : '/', { scroll: false });
  }

  const { data: shows, isPending: isLoadingShows } = useQuery({
    queryKey: showKeys.names(),
    queryFn: () => fetchShowNames(),
  });

  // Not gated on the shows list: the default scope is every show, so the numbers do not wait for
  // the picker's options to arrive.
  const { data: stats, error: statsError } = useQuery({
    queryKey: dashboardKeys.stats(showId, from),
    queryFn: () => fetchShowStats({ showId, from }),
  });

  const { data: recentOrders } = useQuery({
    queryKey: dashboardKeys.recentOrders(),
    queryFn: fetchRecentOrders,
  });

  // A 404 means a `showId` outlived the show it named — a deleted draft still in someone's
  // bookmark. That is a stale selection, not an error worth a panel: fall back to all shows.
  useEffect(() => {
    if (showId && statsError instanceof ApiError && statsError.kind === 'notFound') {
      select(undefined, range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, statsError]);

  const hasNoShows = !isLoadingShows && (shows?.length ?? 0) === 0;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em]">Dashboard</h1>

        {!hasNoShows && (
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={range}
              ariaLabel="Range"
              placeholder="Range"
              onValueChange={(value) => isRange(value) && select(showId, value)}
              options={RANGES.map((option) => ({ value: option.value, label: option.label }))}
            />

            <Select
              value={showId ?? ALL_SHOWS}
              ariaLabel="Show"
              placeholder="All shows"
              disabled={isLoadingShows}
              onValueChange={(value) => select(value === ALL_SHOWS ? undefined : value, range)}
              options={[
                { value: ALL_SHOWS, label: 'All shows' },
                ...(shows ?? []).map((show) => ({ value: show.id, label: show.title })),
              ]}
            />
          </div>
        )}
      </div>

      {hasNoShows ? (
        // The shows screen's own empty state, deliberately — an organizer with nothing has the
        // same next step wherever they landed.
        <div className="rounded-panel border border-dashed border-white/16 px-6 py-15 text-center">
          <h2 className="mb-2 font-display text-lg">No sales yet</h2>
          <p className="mb-5 text-sm text-fg-muted">Create your first show to see sales here.</p>
          <Button asChild>
            <Link href="/shows">New show</Link>
          </Button>
        </div>
      ) : (
        <>
          {stats ? (
            <StatCards stats={stats} />
          ) : (
            <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              {[0, 1, 2, 3].map((card) => (
                <Skeleton key={card} className="h-27 rounded-card" />
              ))}
            </div>
          )}

          <div
            className={`mb-6 grid gap-6 ${showId ? 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]' : ''}`}
          >
            {stats ? (
              <RevenueChart byDay={stats.byDay} />
            ) : (
              <Skeleton className="h-75 rounded-card" />
            )}

            {/* Hidden across all shows: bands are per-show, and the gateway only resolves their
                names for one — several shows' bands would be summed by a name they merely share. */}
            {showId && stats && (
              <PriceBandsCard byTier={stats.byTier} soldCount={stats.soldCount} />
            )}
          </div>

          <RecentOrdersTable orders={recentOrders?.items ?? []} />
        </>
      )}
    </>
  );
}
