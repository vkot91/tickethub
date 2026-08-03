import { recentOrdersSchema, showStatsSchema, type ShowStats } from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (showId: string) => [...dashboardKeys.all, 'stats', showId] as const,
  recentOrders: () => [...dashboardKeys.all, 'recent-orders'] as const,
};

export function fetchShowStats(showId: string): Promise<ShowStats> {
  return clientApi(`/shows/${showId}/stats`, {}, showStatsSchema);
}

export function fetchRecentOrders() {
  return clientApi('/orders/recent', {}, recentOrdersSchema);
}
