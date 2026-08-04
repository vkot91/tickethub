/**
 * The console's one money path. Bands are typed in dollars and stored in cents, and the whole
 * reason this is a module with a spec is that the obvious version is wrong: `19.99 * 100` is
 * `1998.9999999999998` in IEEE 754, so truncating it prices every ticket a cent short.
 *
 * Returns `null` for anything that is not a price — empty, negative, or not a number — so the
 * caller can leave the field alone rather than storing a `NaN`.
 */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();

  // No sign is allowed through: a negative price is rejected here rather than clamped, so a
  // typo'd `-90` does not silently become free seating.
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(trimmed)) return null;

  return Math.round(Number(trimmed) * 100);
}

/** The inverse, for seeding the input from saved pricing. Always two decimals — a band at
 *  `1250` reads `12.50`, not `12.5`. */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
