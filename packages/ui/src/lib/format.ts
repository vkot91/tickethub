const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Prices cross the wire as integer cents; the UI never does float maths on them. */
export function formatPrice(cents: number): string {
  return currency.format(cents / 100);
}

// Fixed locale and time zone: the server and the browser must render the same string,
// or hydration mismatches every date on the page.
const showDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const showDateTime = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export function formatShowDate(startsAt: string): string {
  return showDate.format(new Date(startsAt));
}

export function formatShowDateTime(startsAt: string): string {
  return showDateTime.format(new Date(startsAt));
}

/** Deterministic hue per show id, so a poster placeholder looks stable across renders. */
export function hueFromSeed(seed: string): number {
  let hash = 0;

  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;

  return hash;
}
