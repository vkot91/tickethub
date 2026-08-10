import type { Rpc } from '../../shape';
import type { OrderStats, RecentOrderRow, ShowSales } from './schema';

/**
 * The console's surface onto `apps/orders`. Both calls take a *resolved* `showIds[]` — ownership is
 * proved in the gateway, so Orders never learns who owns what, and an empty list means zeros rather
 * than the whole platform.
 */
export const ORGANIZER_ORDERS_MESSAGE_PATTERNS = {
  STATS: 'organizer.orders.stats',
  // The same two numbers, one row per show, for the console's list. A sibling of STATS rather
  // than a mode of it: STATS answers "how is the whole account doing", this answers "how is each
  // of these shows doing". One round trip for the page instead of one per row.
  SALES_BY_SHOW: 'organizer.orders.salesByShow',
  LATEST: 'organizer.orders.latest',
} as const;

export interface OrganizerOrdersRpcContracts {
  [ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS]: Rpc<{
    payload: { showIds: string[]; from?: string; to?: string };
    result: OrderStats;
  }>;
  [ORGANIZER_ORDERS_MESSAGE_PATTERNS.SALES_BY_SHOW]: Rpc<{
    payload: { showIds: string[] };
    result: ShowSales[];
  }>;
  [ORGANIZER_ORDERS_MESSAGE_PATTERNS.LATEST]: Rpc<{
    payload: { showIds: string[]; limit?: number };
    result: RecentOrderRow[];
  }>;
}
