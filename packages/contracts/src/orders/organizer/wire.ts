import type { OrderStats, RecentOrderRow } from './schema';
import type { Rpc } from '../../shape';

/**
 * The console's surface onto `apps/orders`. Both calls take a *resolved* `showIds[]` — ownership is
 * proved in the gateway, so Orders never learns who owns what, and an empty list means zeros rather
 * than the whole platform.
 */
export const ORGANIZER_ORDERS_MESSAGE_PATTERNS = {
  STATS: 'organizer.orders.stats',
  RECENT: 'organizer.orders.recent',
} as const;

export interface OrganizerOrdersRpcContracts {
  [ORGANIZER_ORDERS_MESSAGE_PATTERNS.STATS]: Rpc<{
    payload: { showIds: string[]; from?: string; to?: string };
    result: OrderStats;
  }>;
  [ORGANIZER_ORDERS_MESSAGE_PATTERNS.RECENT]: Rpc<{
    payload: { showIds: string[]; limit?: number };
    result: RecentOrderRow[];
  }>;
}
