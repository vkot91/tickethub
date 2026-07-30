import type { CreateOrderDto, OrderListQuery, OrderResponse, OrderSummaryPage } from './schema';
import type { OrderStats, RecentOrderRow } from '../organizer/schema';
import type { Rpc } from '../shape';

export const ORDERS_MESSAGE_PATTERNS = {
  CREATE: 'orders.create',
  GET: 'orders.get',
  LIST: 'orders.list',
  REQUEST_REFUND: 'orders.requestRefund',
  // Organizer dashboard. Both take a resolved `showIds[]` — Orders never learns who owns what.
  STATS: 'orders.stats',
  RECENT: 'orders.recent',
} as const;

export const ORDER_ROUTING_KEYS = {
  ORDER_AWAITING_PAYMENT: 'order.awaiting_payment',
  ORDER_PAID: 'order.paid',
  ORDER_EXPIRED: 'order.expired',
  ORDER_CANCELLED: 'order.cancelled',
  SEAT_HELD: 'seat.held',
  SEAT_RELEASED: 'seat.released',
  REFUND_REQUESTED: 'refund.requested',
} as const;

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
