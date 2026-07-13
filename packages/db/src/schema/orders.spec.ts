import { orders, seatReservations, ordersOutbox } from './orders';

describe('orders schema', () => {
  it('orders table exposes idempotency + status columns', () => {
    expect(Object.keys(orders)).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'eventId',
        'status',
        'idempotencyKey',
        'totalCents',
        'expiresAt',
      ]),
    );
  });

  it('seat_reservations exposes seat + status columns', () => {
    expect(Object.keys(seatReservations)).toEqual(
      expect.arrayContaining(['id', 'orderId', 'eventId', 'seatId', 'ticketTypeId', 'status']),
    );
  });

  it('reuses the outbox factory for the orders schema', () => {
    expect(Object.keys(ordersOutbox)).toEqual(
      expect.arrayContaining(['routingKey', 'payload', 'publishedAt']),
    );
  });
});
