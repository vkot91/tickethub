import { createOrderSchema } from './schema';
import { ORDERS_MESSAGE_PATTERNS } from './wire';

describe('buyer orders wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(ORDERS_MESSAGE_PATTERNS.CREATE).toBe('user.orders.create');
    expect(ORDERS_MESSAGE_PATTERNS.REQUEST_REFUND).toBe('user.orders.requestRefund');
  });

  it('carries no organizer key', () => {
    for (const key of Object.values(ORDERS_MESSAGE_PATTERNS)) {
      expect(key.startsWith('user.orders.')).toBe(true);
    }
  });
});

describe('createOrderSchema', () => {
  it('accepts a valid create-order payload', () => {
    const dto = createOrderSchema.parse({
      showId: '00000000-0000-0000-0000-000000000001',
      seats: [
        {
          seatId: '00000000-0000-0000-0000-000000000002',
          bandId: '00000000-0000-0000-0000-000000000003',
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
});
