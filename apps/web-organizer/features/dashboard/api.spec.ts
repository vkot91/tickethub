import { describe, expect, it } from 'vitest';

import { SHOW_ID } from '../test-gateway';
import { dashboardKeys, fromFor } from './api';

describe('dashboard api keys', () => {
  it('namespaces stats per show and per range — two ranges of one show are not one cache entry', () => {
    expect(dashboardKeys.stats(SHOW_ID, '2026-08-01T00:00:00.000Z')).toEqual([
      'dashboard',
      'stats',
      SHOW_ID,
      '2026-08-01T00:00:00.000Z',
    ]);
  });

  it('keys the all-shows scope distinctly from a single show', () => {
    expect(dashboardKeys.stats(undefined, '')).toEqual(['dashboard', 'stats', 'all', '']);
  });

  it('keeps recent orders under the same root, so the screen invalidates as one', () => {
    expect(dashboardKeys.recentOrders()).toEqual(['dashboard', 'recent-orders']);
  });
});

describe('fromFor', () => {
  const now = new Date('2026-08-05T13:45:00.000Z');

  it('floors to midnight UTC, so the key is stable within a day rather than every render', () => {
    expect(fromFor('7d', now)).toBe('2026-07-29T00:00:00.000Z');
    expect(fromFor('30d', now)).toBe('2026-07-06T00:00:00.000Z');
  });

  it('sends an explicit floor for all time — an omitted `from` is the backend 30-day default', () => {
    expect(fromFor('all', now)).toBe('2020-01-01T00:00:00.000Z');
  });
});
