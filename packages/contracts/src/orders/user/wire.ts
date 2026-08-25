import type { Rpc } from '../../shape';
import type {
  CreateOrderDto,
  OrderListQuery,
  OrderResponse,
  OrderSummaryPage,
  SeatStatusMap,
} from './schema';

/**
 * A buyer acting on their own orders — every payload carries the `userId` the service scopes to,
 * with one exception. `SEAT_STATUS` asks about a *show*, not about a buyer: it answers which seats
 * of a show are taken, which is the same public question `GET /shows/:id/seat-map` already answers
 * unguarded. It lives in the buyer map because the buyer catalog is what consumes it.
 */
export const ORDERS_MESSAGE_PATTERNS = {
  CREATE: 'user.orders.create',
  GET: 'user.orders.get',
  LIST: 'user.orders.list',
  REQUEST_REFUND: 'user.orders.requestRefund',
  SEAT_STATUS: 'user.orders.seatStatus',
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
  [ORDERS_MESSAGE_PATTERNS.SEAT_STATUS]: Rpc<{
    payload: { showId: string };
    result: SeatStatusMap;
  }>;
}
