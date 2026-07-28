import { describe, expect, it } from 'vitest';

import { organizerKeys, updateShowSchema } from './api';
import { SHOW_ID } from './test-gateway';

describe('organizer api', () => {
  it('namespaces stats per show', () => {
    expect(organizerKeys.stats(SHOW_ID)).toEqual(['organizer', 'stats', SHOW_ID]);
  });

  it('lets an update carry only the fields being changed', () => {
    expect(updateShowSchema.parse({ title: 'New title' })).toEqual({ title: 'New title' });
  });

  it('still rejects a bad value on a partial update', () => {
    expect(() => updateShowSchema.parse({ venueId: 'not-a-uuid' })).toThrow();
  });
});
