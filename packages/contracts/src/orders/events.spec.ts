import { ORDER_ROUTING_KEYS, orderAwaitingPaymentSchema } from './events';

describe('orders events', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORDER_ROUTING_KEYS.ORDER_AWAITING_PAYMENT).toBe('order.awaitingPayment');
    expect(ORDER_ROUTING_KEYS.SEAT_RELEASED).toBe('seat.released');
  });

  it('validates the awaiting_payment event shape', () => {
    const event = orderAwaitingPaymentSchema.parse({
      orderId: '00000000-0000-0000-0000-000000000005',
      userId: '00000000-0000-0000-0000-000000000006',
      showId: '00000000-0000-0000-0000-000000000001',
      totalCents: 5000,
    });

    expect(event.totalCents).toBe(5000);
  });
});
