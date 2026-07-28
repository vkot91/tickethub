// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { safeRedirectPath } from './config';

describe('safeRedirectPath', () => {
  it('keeps a path on this app', () => {
    expect(safeRedirectPath('/shows/abc?tab=seats')).toBe('/shows/abc?tab=seats');
  });

  it.each([
    ['//evil.example', 'protocol-relative'],
    ['https://evil.example', 'absolute'],
    ['javascript:alert(1)', 'scheme'],
    ['shows', 'relative'],
    [undefined, 'missing'],
  ])('sends %s (%s) home instead', (next) => {
    expect(safeRedirectPath(next)).toBe('/');
  });
});
