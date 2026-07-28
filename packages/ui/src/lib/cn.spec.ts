import { describe, expect, it } from 'vitest';

import { cn } from './cn';

describe('cn', () => {
  it('lets a later Tailwind class win over an earlier conflicting one', () => {
    expect(cn('px-2 text-fg', 'px-6')).toBe('text-fg px-6');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
