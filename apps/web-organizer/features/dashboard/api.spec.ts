import { describe, expect, it } from 'vitest';

import { dashboardKeys } from './api';
import { SHOW_ID } from '../test-gateway';

describe('dashboard api keys', () => {
  it('namespaces stats per show', () => {
    expect(dashboardKeys.stats(SHOW_ID)).toEqual(['dashboard', 'stats', SHOW_ID]);
  });

  it('keeps recent orders under the same root, so the screen invalidates as one', () => {
    expect(dashboardKeys.recentOrders()).toEqual(['dashboard', 'recent-orders']);
  });
});
