import { describe, expect, it } from 'vitest';

import { orderIdempotencyKey } from './api';

const seats = [
  { seatId: 'seat-b', bandId: 'band-1' },
  { seatId: 'seat-a', bandId: 'band-1' },
];

describe('orderIdempotencyKey', () => {
  it('is stable across calls, so a replayed click reuses the same order', () => {
    expect(orderIdempotencyKey('show-1', seats)).toBe(orderIdempotencyKey('show-1', seats));
  });

  it('ignores selection order', () => {
    expect(orderIdempotencyKey('show-1', seats)).toBe(
      orderIdempotencyKey('show-1', [...seats].reverse()),
    );
  });

  it('differs per show and per seat set', () => {
    expect(orderIdempotencyKey('show-2', seats)).not.toBe(orderIdempotencyKey('show-1', seats));
    expect(orderIdempotencyKey('show-1', seats.slice(0, 1))).not.toBe(
      orderIdempotencyKey('show-1', seats),
    );
  });
});
