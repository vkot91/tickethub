import { orderResponseSchema, seatMapSchema, type OrderResponse } from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

/** Polling cadence while the socket gateway does not exist yet. */
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
  bandId: string;
}

export function createOrder(showId: string, seats: OrderSeat[]): Promise<OrderResponse> {
  return clientApi(
    '/orders',
    {
      method: 'POST',
      // Derived, not random: a fresh key per call would make every replay a second order.
      headers: { 'idempotency-key': orderIdempotencyKey(showId, seats) },
      body: { showId, seats },
    },
    orderResponseSchema,
  );
}

export function orderIdempotencyKey(showId: string, seats: OrderSeat[]): string {
  const seatIds = seats.map((seat) => seat.seatId).sort();

  return `${showId}:${seatIds.join(',')}`;
}
