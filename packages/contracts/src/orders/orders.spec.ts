import { createOrderSchema, orderAwaitingPaymentSchema } from './index';
import { ORDER_ROUTING_KEYS, ORDERS_MESSAGE_PATTERNS } from '../events';

describe('order contracts', () => {
  it('accepts a valid create-order payload', () => {
    const dto = createOrderSchema.parse({
      showId: '00000000-0000-0000-0000-000000000001',
      seats: [
        {
          seatId: '00000000-0000-0000-0000-000000000002',
          ticketTypeId: '00000000-0000-0000-0000-000000000003',
        },
      ],
    });
    expect(dto.seats).toHaveLength(1);
  });

  it('rejects an empty seats array', () => {
    expect(() =>
      createOrderSchema.parse({ showId: '00000000-0000-0000-0000-000000000001', seats: [] }),
    ).toThrow();
  });

  it('validates the awaiting_payment event shape', () => {
    const ev = orderAwaitingPaymentSchema.parse({
      messageId: '00000000-0000-0000-0000-000000000004',
      orderId: '00000000-0000-0000-0000-000000000005',
      userId: '00000000-0000-0000-0000-000000000006',
      showId: '00000000-0000-0000-0000-000000000001',
      totalCents: 5000,
    });
    expect(ev.totalCents).toBe(5000);
    expect(ORDER_ROUTING_KEYS.ORDER_AWAITING_PAYMENT).toBe('order.awaiting_payment');
  });

  it('exposes orders message patterns', () => {
    expect(ORDERS_MESSAGE_PATTERNS.CREATE).toBe('orders.create');
  });
});
