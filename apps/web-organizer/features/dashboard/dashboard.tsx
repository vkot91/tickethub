'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Card, Select, Skeleton } from '@tickethub/ui';

import { fetchOrganizerShows, showKeys } from '../shows/api';
import { dashboardKeys, fetchRecentOrders, fetchShowStats } from './api';
import { RecentOrdersTable } from './recent-orders-table';
import { RevenueChart } from './revenue-chart';
import { StatCards } from './stat-cards';

export function Dashboard() {
  const [selectedShowId, setSelectedShowId] = useState<string>();

  const { data: shows, isPending: isLoadingShows } = useQuery({
    queryKey: showKeys.list(),
    queryFn: () => fetchOrganizerShows(),
  });

  // Default to the first show rather than storing a copy of it in state.
  const showId = selectedShowId ?? shows?.[0]?.id;

  const { data: stats } = useQuery({
    queryKey: dashboardKeys.stats(showId ?? ''),
    queryFn: () => fetchShowStats(showId!),
    enabled: Boolean(showId),
  });

  const { data: recentOrders } = useQuery({
    queryKey: dashboardKeys.recentOrders(),
    queryFn: fetchRecentOrders,
  });

  if (isLoadingShows) return <Skeleton className="h-105 rounded-panel" />;

  if (!shows || shows.length === 0) {
    return (
      <Card radius="panel" padding="lg" className="text-center">
        <p className="text-sm text-fg-muted">
          You have no shows yet. Create one to start selling tickets.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[32px] font-semibold tracking-[-0.02em]">Dashboard</h1>

        <Select
          value={showId}
          ariaLabel="Show"
          placeholder="Pick a show"
          onValueChange={setSelectedShowId}
          options={shows.map((show) => ({ value: show.id, label: show.title }))}
        />
      </div>

      {stats ? (
        <>
          <StatCards stats={stats} />

          <div className="mb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <RevenueChart byDay={stats.byDay} />

            <Card padding="lg" asChild>
              <section aria-labelledby="sold-heading">
                <h2 id="sold-heading" className="mb-5 font-display text-lg font-semibold">
                  Seats sold
                </h2>
                <p className="font-display text-[40px] leading-none font-semibold">
                  {stats.soldCount}
                  <span className="ml-2 font-mono text-sm text-fg-faint">/ {stats.capacity}</span>
                </p>
              </section>
            </Card>
          </div>
        </>
      ) : (
        <Skeleton className="mb-6 h-75 rounded-card" />
      )}

      <RecentOrdersTable orders={recentOrders?.items ?? []} />
    </>
  );
}
