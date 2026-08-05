import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { type Metadata } from 'next';

import { recentOrdersSchema, showStatsSchema } from '@tickethub/contracts';
import { getServerQueryClient } from '@tickethub/web-kit/server';

import { dashboardKeys, DEFAULT_RANGE, fromFor, isRange } from '@/features/dashboard/api';
import { Dashboard } from '@/features/dashboard/dashboard';
import { serverApi } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ showId?: string; range?: string }>;
}) {
  const { showId, range } = await searchParams;

  const from = fromFor(isRange(range) ? range : DEFAULT_RANGE);

  const queryClient = getServerQueryClient();

  // Seeds the exact keys the screen reads, so the first HTML response already carries the numbers.
  // `prefetchQuery` rather than `fetchQuery`: a gateway hiccup — or a stale `?showId=` that 404s —
  // leaves the cache empty and the client refetches through the BFF, which is the path that can
  // refresh and redirect properly. Slower, never a 500.
  //
  // The show picker's options are deliberately not seeded here: they never gate first paint (the
  // dashboard renders "All shows" until they arrive) and unlike stats/recent-orders there is no
  // per-organizer `?showId=` to go stale, so a client-only fetch is the whole feature, not a
  // corner cut off it.
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.stats(showId, from),
      queryFn: () =>
        serverApi(
          `/organizer/stats?${new URLSearchParams({ ...(showId ? { showId } : {}), from })}`,
          {},
          showStatsSchema,
        ),
    }),
    queryClient.prefetchQuery({
      queryKey: dashboardKeys.recentOrders(),
      queryFn: () => serverApi('/organizer/orders/recent', {}, recentOrdersSchema),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Dashboard showId={showId} range={range} />
    </HydrationBoundary>
  );
}
