import { describe, expect, it } from 'vitest';

import { formatPrice, formatShowDate, formatShowDateTime, hueFromSeed } from './format';

describe('formatPrice', () => {
  it('renders integer cents as whole dollars', () => {
    expect(formatPrice(32000)).toBe('$320');
    expect(formatPrice(0)).toBe('$0');
  });
});

describe('show date formatting', () => {
  // Fixed UTC output: the server and the browser must agree or hydration breaks.
  it('formats a date the same way regardless of local time zone', () => {
    expect(formatShowDate('2026-08-14T20:00:00.000Z')).toBe('14 Aug');
  });

  it('formats the long form with weekday and time', () => {
    expect(formatShowDateTime('2026-08-14T20:00:00.000Z')).toBe('Fri, 14 August 2026 at 20:00');
  });
});

describe('hueFromSeed', () => {
  it('is stable for the same seed', () => {
    expect(hueFromSeed('show-1')).toBe(hueFromSeed('show-1'));
  });

  it('stays inside the hue range', () => {
    for (const seed of ['a', 'show-42', 'x'.repeat(64)]) {
      expect(hueFromSeed(seed)).toBeGreaterThanOrEqual(0);
      expect(hueFromSeed(seed)).toBeLessThan(360);
    }
  });
});
