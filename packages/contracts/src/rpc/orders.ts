import type { OrderStats, RecentOrderRow } from '../dto/organizer';
import type { ORDERS_MESSAGE_PATTERNS } from '../events';
import type { CreateOrderDto, OrderListQuery, OrderResponse, OrderSummaryPage } from '../orders';
import type { Rpc } from './shape';

export interface OrdersRpcContracts {
  [ORDERS_MESSAGE_PATTERNS.CREATE]: Rpc<{
    payload: { userId: string; idempotencyKey: string; dto: CreateOrderDto };
    result: OrderResponse;
  }>;
  [ORDERS_MESSAGE_PATTERNS.GET]: Rpc<{
    payload: { userId: string; orderId: string };
    result: OrderResponse;
  }>;
  [ORDERS_MESSAGE_PATTERNS.LIST]: Rpc<{
    payload: { userId: string; query: OrderListQuery };
    result: OrderSummaryPage;
  }>;
  [ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND]: Rpc<{
    payload: { userId: string; orderId: string };
    result: OrderResponse;
  }>;

  // The console's two. Both take a *resolved* showIds[] — ownership is proved in the gateway, so
  // Orders never learns who owns what, and an empty list means zeros rather than the platform.
  [ORDERS_MESSAGE_PATTERNS.STATS]: Rpc<{
    payload: { showIds: string[]; from?: string; to?: string };
    result: OrderStats;
  }>;
  [ORDERS_MESSAGE_PATTERNS.RECENT]: Rpc<{
    payload: { showIds: string[]; limit?: number };
    result: RecentOrderRow[];
  }>;
}
