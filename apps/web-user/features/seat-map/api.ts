import { orderResponseSchema, seatMapViewSchema, type OrderResponse } from '@tickethub/contracts';
import { clientApi } from '@tickethub/web-kit';

/** How often to refetch while the socket is down. Zero traffic while it is up. */
export const SEAT_MAP_FALLBACK_POLL_MS = 5_000;

export const seatMapKeys = {
  all: ['seat-map'] as const,
  byShow: (showId: string) => [...seatMapKeys.all, showId] as const,
};

export function seatMapPath(showId: string): string {
  return `/shows/${showId}/seat-map`;
}

export function fetchSeatMap(showId: string) {
  return clientApi(seatMapPath(showId), {}, seatMapViewSchema);
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
