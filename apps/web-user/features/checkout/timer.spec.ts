import { describe, expect, it } from 'vitest';

import {
  formatCountdown,
  HOLD_WINDOW_MS,
  isUrgent,
  msLeft,
  progressPercent,
  URGENT_MS,
} from './timer';

const EXPIRES_AT = '2026-08-14T20:10:00.000Z';
const expiry = new Date(EXPIRES_AT).getTime();

describe('msLeft', () => {
  it('counts down to the order expiry', () => {
    expect(msLeft(EXPIRES_AT, expiry - 60_000)).toBe(60_000);
  });

  it('never goes negative once the hold is gone', () => {
    expect(msLeft(EXPIRES_AT, expiry + 5_000)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it.each([
    [600_000, '10:00'],
    [90_000, '1:30'],
    [9_000, '0:09'],
    [0, '0:00'],
  ])('renders %ims as %s', (remaining, expected) => {
    expect(formatCountdown(remaining)).toBe(expected);
  });

  it('rounds a part-second up, so the timer never shows 0:00 while time is left', () => {
    expect(formatCountdown(500)).toBe('0:01');
  });
});

describe('progressPercent', () => {
  it('is full at the start of the window and empty at the end', () => {
    expect(progressPercent(HOLD_WINDOW_MS)).toBe(100);
    expect(progressPercent(0)).toBe(0);
  });

  it('clamps an order held longer than the standard window', () => {
    expect(progressPercent(HOLD_WINDOW_MS * 2)).toBe(100);
  });
});

describe('isUrgent', () => {
  it('turns on at the 90 second boundary and not a moment earlier', () => {
    expect(isUrgent(URGENT_MS + 1)).toBe(false);
    expect(isUrgent(URGENT_MS)).toBe(true);
  });

  it('is false once the hold is gone — that is expiry, not urgency', () => {
    expect(isUrgent(0)).toBe(false);
  });
});
