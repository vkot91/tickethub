import { type OrderResponse, orderResponseSchema, seatMapSchema } from '@tickethub/contracts';

import { clientApi } from '@tickethub/web-kit';

/** Polling cadence while the socket gateway does not exist yet (BACKEND-GAPS.md §3). */
export const SEAT_MAP_POLL_MS = 3_000;

export const seatMapKeys = {
  all: ['seat-map'] as const,
  byShow: (showId: string) => [...seatMapKeys.all, showId] as const,
};

export function seatMapPath(showId: string): string {
  return `/shows/${showId}/seat-map`;
}

export function fetchSeatMap(showId: string) {
  return clientApi(seatMapPath(showId), {}, seatMapSchema);
}

export interface OrderSeat {
  seatId: string;
  ticketTypeId: string;
}

export function createOrder(showId: string, seats: OrderSeat[]): Promise<OrderResponse> {
  return clientApi(
    '/orders',
    {
      method: 'POST',
      // Replays of the same click must not create a second order.
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { showId, seats },
    },
    orderResponseSchema,
  );
}
