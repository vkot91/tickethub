import {
  orderListSchema,
  orderResponseSchema,
  type OrderList,
  type OrderListItem,
  type OrderResponse,
} from '@tickethub/contracts';

import { clientApi } from '@tickethub/web-kit';

/** How often the UI asks whether the saga has moved an order on. */
export const ORDER_POLL_MS = 2_000;

export const ORDER_PAGE_SIZE = 20;

export const orderKeys = {
  all: ['order'] as const,
  list: () => [...orderKeys.all, 'list'] as const,
  byId: (orderId: string) => [...orderKeys.all, orderId] as const,
  paymentIntent: (orderId: string) => [...orderKeys.byId(orderId), 'payment-intent'] as const,
};

/** Statuses the saga will not move away from — polling stops here. */
export type SettledStatus = Exclude<OrderResponse['status'], 'awaiting_payment'>;

const SETTLED: SettledStatus[] = ['paid', 'expired', 'cancelled', 'refunded'];

export function isSettled(status: OrderResponse['status']): status is SettledStatus {
  return (SETTLED as OrderResponse['status'][]).includes(status);
}

export type { OrderList, OrderListItem };

export function ordersPath(cursor?: string): string {
  const params = new URLSearchParams({ limit: String(ORDER_PAGE_SIZE) });

  if (cursor) params.set('cursor', cursor);

  return `/orders?${params}`;
}

export function fetchOrders(cursor?: string): Promise<OrderList> {
  return clientApi(ordersPath(cursor), {}, orderListSchema);
}

export function fetchOrder(orderId: string): Promise<OrderResponse> {
  return clientApi(`/orders/${orderId}`, {}, orderResponseSchema);
}

/** Kicks off the refund saga; the order reaches `refunded` only once Stripe confirms. */
export function requestRefund(orderId: string): Promise<OrderResponse> {
  return clientApi(`/orders/${orderId}/refund`, { method: 'POST' }, orderResponseSchema);
}
