import { recentOrdersSchema, showStatsSchema, type ShowStats } from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

export const RANGES = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
] as const;

export type Range = (typeof RANGES)[number]['value'];

export const DEFAULT_RANGE: Range = '30d';

export function isRange(value: string | undefined): value is Range {
  return RANGES.some((range) => range.value === value);
}

/** Nothing in TicketHub predates this. "All time" has to send a floor rather than omit `from`:
 *  the backend windows `byDay` to the last 30 days when it gets none, so an omitted `from`
 *  would silently mean "Last 30 days". */
const EPOCH = '2020-01-01T00:00:00.000Z';

/**
 * The range as a `from`, floored to midnight UTC — it goes in the query key, and a live timestamp
 * there is a new key on every render, which is a refetch loop. `to` is never sent: the backend
 * defaults it to now, which is what every range here wants.
 */
export function fromFor(range: Range, now = new Date()): string {
  if (range === 'all') return EPOCH;

  const from = new Date(now);

  from.setUTCDate(from.getUTCDate() - (range === '7d' ? 7 : 30));
  from.setUTCHours(0, 0, 0, 0);

  return from.toISOString();
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  // Both the scope and the range are in the key: two ranges of one show are two answers, and
  // sharing one entry would render the first range's numbers under the second's label.
  stats: (showId: string | undefined, from: string) =>
    [...dashboardKeys.all, 'stats', showId ?? 'all', from] as const,
  recentOrders: () => [...dashboardKeys.all, 'recent-orders'] as const,
};

/** `showId` omitted means every show the caller owns — ownership is resolved in the gateway. */
export function fetchShowStats(params: { showId?: string; from: string }): Promise<ShowStats> {
  const query = new URLSearchParams();

  if (params.showId) query.set('showId', params.showId);

  query.set('from', params.from);

  return clientApi(`/organizer/stats?${query}`, {}, showStatsSchema);
}

export function fetchRecentOrders() {
  return clientApi('/organizer/orders/recent', {}, recentOrdersSchema);
}
