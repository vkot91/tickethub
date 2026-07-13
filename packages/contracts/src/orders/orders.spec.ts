import { createOrderSchema, orderAwaitingPaymentSchema, ORDER_ROUTING_KEYS } from './index';
import { MESSAGE_PATTERNS, QUEUES } from '../events';

describe('order contracts', () => {
  it('accepts a valid create-order payload', () => {
    const dto = createOrderSchema.parse({
      eventId: '00000000-0000-0000-0000-000000000001',
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
      createOrderSchema.parse({ eventId: '00000000-0000-0000-0000-000000000001', seats: [] }),
    ).toThrow();
  });

  it('validates the awaiting_payment event shape', () => {
    const ev = orderAwaitingPaymentSchema.parse({
      messageId: '00000000-0000-0000-0000-000000000004',
      orderId: '00000000-0000-0000-0000-000000000005',
      userId: '00000000-0000-0000-0000-000000000006',
      eventId: '00000000-0000-0000-0000-000000000001',
      totalCents: 5000,
    });
    expect(ev.totalCents).toBe(5000);
    expect(ORDER_ROUTING_KEYS.orderAwaitingPayment).toBe('order.awaiting_payment');
  });

  it('exposes orders queues and message patterns', () => {
    expect(QUEUES.ordersRpc).toBe('orders.rpc');
    expect(MESSAGE_PATTERNS.orders.create).toBe('orders.create');
  });
});
