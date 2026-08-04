import { describe, expect, it } from 'vitest';

import { centsToDollars, dollarsToCents } from './money';

describe('dollarsToCents', () => {
  // The case this module exists for. `19.99 * 100` is 1998.9999999999998; anything that
  // truncates instead of rounding underprices every seat in the band by a cent.
  it('turns $19.99 into 1999 cents, not 1998', () => {
    expect(dollarsToCents('19.99')).toBe(1999);
  });

  it.each([
    ['12.5', 1250],
    ['0', 0],
    ['0.01', 1],
    ['90', 9000],
    ['.5', 50],
    [' 45.00 ', 4500],
    ['1234.56', 123456],
  ])('parses %s to %i cents', (input, cents) => {
    expect(dollarsToCents(input)).toBe(cents);
  });

  // Null, never a number: the caller keeps the previous price rather than storing NaN, which
  // `putPricingSchema` would reject on save with nothing on screen explaining why.
  it.each(['', '   ', '-5', '-0.01', 'abc', '12.3.4', '1e3', '$12', '.'])('refuses %o', (input) => {
    expect(dollarsToCents(input)).toBeNull();
  });
});

describe('centsToDollars', () => {
  it.each([
    [1999, '19.99'],
    [1250, '12.50'],
    [0, '0.00'],
    [9000, '90.00'],
  ])('renders %i cents as %s', (cents, dollars) => {
    expect(centsToDollars(cents)).toBe(dollars);
  });

  it('round-trips through dollarsToCents', () => {
    for (const cents of [1, 999, 1999, 123456]) {
      expect(dollarsToCents(centsToDollars(cents))).toBe(cents);
    }
  });
});
