import type { CreateOrderDto, OrderListQuery, OrderResponse, OrderSummaryPage } from './schema';
import type { Rpc } from '../../shape';

/** A buyer acting on their own orders. Every payload carries the `userId` the service scopes to. */
export const ORDERS_MESSAGE_PATTERNS = {
  CREATE: 'orders.create',
  GET: 'orders.get',
  LIST: 'orders.list',
  REQUEST_REFUND: 'orders.requestRefund',
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
}
