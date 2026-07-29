import { describe, expect, it } from 'vitest';

import { organizerKeys } from './api';
import { SHOW_ID } from './test-gateway';

// `updateShowSchema` now lives in `@tickethub/contracts` and is tested there.
describe('organizer api', () => {
  it('namespaces stats per show', () => {
    expect(organizerKeys.stats(SHOW_ID)).toEqual(['organizer', 'stats', SHOW_ID]);
  });
});
