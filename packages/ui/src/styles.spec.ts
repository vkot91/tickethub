import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * A `@theme` colour named after a Tailwind font-size step shadows the `text-*` size
 * utility — `--color-base` once turned every `text-base` heading near-black on the
 * dark page. Keep colour token names clear of that namespace.
 */
describe('design tokens', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');

  it('does not name a colour after a Tailwind text-size step', () => {
    const fontSizeSteps = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];

    const colourNames = [...css.matchAll(/^\s*--color-([\w-]+):/gm)].map((match) => match[1]);

    expect(colourNames.filter((name) => fontSizeSteps.includes(name))).toEqual([]);
  });
});
