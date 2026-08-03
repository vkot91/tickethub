import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const src = dirname(fileURLToPath(import.meta.url));

/**
 * A `@theme` colour named after a Tailwind font-size step shadows the `text-*` size
 * utility — `--color-base` once turned every `text-base` heading near-black on the
 * dark page. Keep colour token names clear of that namespace.
 */
describe('design tokens', () => {
  const css = readFileSync(resolve(src, 'styles.css'), 'utf8');

  const colourNames = [...css.matchAll(/^\s*--color-([\w-]+):/gm)].map((match) => match[1]);

  it('does not name a colour after a Tailwind text-size step', () => {
    const fontSizeSteps = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];

    expect(colourNames.filter((name) => fontSizeSteps.includes(name))).toEqual([]);
  });

  it('only uses colour utilities that resolve to a declared token', () => {
    const roots = new Set(colourNames.map((name) => name.split('-')[0]));

    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.tsx'),
    );

    const unresolved = files.flatMap((file) => {
      const source = readFileSync(join(src, file), 'utf8');

      return [...source.matchAll(/\b(?:text|bg|border|outline|ring|fill|stroke)-([a-z][\w-]*)/g)]
        .map((match) => match[1])
        .filter((name) => roots.has(name.split('-')[0]) && !colourNames.includes(name))
        .map((name) => `${file}: ${name}`);
    });

    expect(unresolved).toEqual([]);
  });
});
