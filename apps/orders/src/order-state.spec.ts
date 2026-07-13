import { canTransition } from './order-state';

describe('order state machine', () => {
  it('allows awaiting_payment → paid/expired/cancelled', () => {
    expect(canTransition('awaiting_payment', 'paid')).toBe(true);
    expect(canTransition('awaiting_payment', 'expired')).toBe(true);
    expect(canTransition('awaiting_payment', 'cancelled')).toBe(true);
  });

  it('allows paid → refunded only', () => {
    expect(canTransition('paid', 'refunded')).toBe(true);
    expect(canTransition('paid', 'expired')).toBe(false);
  });

  it('forbids leaving terminal states', () => {
    expect(canTransition('expired', 'paid')).toBe(false);
    expect(canTransition('refunded', 'paid')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
  });
});
