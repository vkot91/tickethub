import type { PutPricingDto, SeatTier, ShowPricing, VenueDetail } from '@tickethub/contracts';

/**
 * The pricing tab's local state, and the rules that keep it valid enough to `PUT`.
 *
 * Everything here is addressed by `key`, not by id, because `putPricingSchema` is: a band the
 * organizer just added can be assigned to a section before the server has ever seen it. The
 * server maps `key → id` on save and never stores the key, so a key is only ever a handle for
 * the body being built right now — reseeded from ids after every refetch, never held across one.
 */
export interface BandDraft {
  key: string;
  name: string;
  /** Cents, always. The dollars the organizer types are parsed at the edge by `dollarsToCents`. */
  priceCents: number;
  tier: SeatTier;
}

/** `sectionId → band key`. A section absent from the map is simply not on sale. */
export type SectionAssignments = Record<string, string>;

export function newBand(): BandDraft {
  return { key: crypto.randomUUID(), name: '', priceCents: 0, tier: 'standard' };
}

/** Saved pricing → form state. The band's server id becomes its local key: a fresh handle for
 *  the next PUT, which is all a key ever is. */
export function seedBands(pricing: ShowPricing): BandDraft[] {
  return pricing.priceBands.map((band) => ({
    key: band.id,
    name: band.name,
    priceCents: band.priceCents,
    tier: band.tier,
  }));
}

export function seedAssignments(pricing: ShowPricing): SectionAssignments {
  return Object.fromEntries(
    pricing.assignments.map(({ sectionId, bandId }) => [sectionId, bandId]),
  );
}

/** How many sections a band prices — the number behind the removal warning. */
export function bandUsage(assignments: SectionAssignments, key: string): number {
  return Object.values(assignments).filter((assigned) => assigned === key).length;
}

/**
 * Removing a band takes its sections off sale with it. Not a nicety: an assignment left pointing
 * at a removed key makes the whole `PUT` a 400 (`No price band with key …`), and the organizer
 * would be looking at a screen that says nothing about why.
 */
export function removeBand(
  bands: BandDraft[],
  assignments: SectionAssignments,
  key: string,
): { bands: BandDraft[]; assignments: SectionAssignments } {
  return {
    bands: bands.filter((band) => band.key !== key),
    assignments: Object.fromEntries(
      Object.entries(assignments).filter(([, assigned]) => assigned !== key),
    ),
  };
}

export function assignSection(
  assignments: SectionAssignments,
  sectionId: string,
  key: string | null,
): SectionAssignments {
  const next = { ...assignments };

  // Null is "— Not on sale —": the entry goes away rather than being stored as empty, so the
  // body below never has to filter it out.
  if (key === null) delete next[sectionId];
  else next[sectionId] = key;

  return next;
}

/** The body of the PUT. Assignments naming a band that is no longer in the list are dropped
 *  rather than sent — `removeBand` already prevents it, and this is the belt to that braces. */
export function toPutPricingBody(
  bands: BandDraft[],
  assignments: SectionAssignments,
): PutPricingDto {
  const keys = new Set(bands.map((band) => band.key));

  return {
    priceBands: bands.map(({ key, name, tier, priceCents }) => ({ key, name, tier, priceCents })),
    assignments: Object.entries(assignments)
      .filter(([, key]) => keys.has(key))
      .map(([sectionId, bandKey]) => ({ sectionId, bandKey })),
  };
}

export function seatCount(section: VenueDetail['sections'][number]): number {
  return section.rows.reduce((total, row) => total + row.seats.length, 0);
}

/** The mono line above the sections card: `3 OF 4 SECTIONS ON SALE · 368 SEATS`. Counts only
 *  assigned sections and sums only their seats — the hall's capacity is a different number. */
export function sectionSummary(
  sections: VenueDetail['sections'],
  assignments: SectionAssignments,
): string {
  const priced = sections.filter((section) => assignments[section.id]);
  const seats = priced.reduce((total, section) => total + seatCount(section), 0);

  return `${priced.length} OF ${sections.length} SECTIONS ON SALE · ${seats} SEATS`;
}
