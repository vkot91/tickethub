import { describe, expect, it } from 'vitest';

import type { ShowPricing, VenueDetail } from '@tickethub/contracts';

import {
  assignSection,
  bandUsage,
  newBand,
  removeBand,
  sectionSummary,
  seedAssignments,
  seedBands,
  toPutPricingBody,
  type BandDraft,
} from './pricing-model';

const SECTION_A = '11111111-1111-4111-8111-111111111111';
const SECTION_B = '22222222-2222-4222-8222-222222222222';
const BAND_ID = '33333333-3333-4333-8333-333333333333';

const band = (key: string, priceCents = 9000): BandDraft => ({
  key,
  name: key,
  priceCents,
  tier: 'standard',
});

function venueSection(id: string, name: string, seats: number): VenueDetail['sections'][number] {
  return {
    id,
    name,
    rows: [
      {
        id: `${id}-row`,
        number: 1,
        seats: Array.from({ length: seats }, (_, i) => ({ id: `${id}-s${i}`, number: i + 1 })),
      },
    ],
  };
}

describe('toPutPricingBody', () => {
  // The case `putPricingSchema.key` exists for: a band with no server id yet can still price a
  // section, because the body refers to it by the same handle it declares.
  it('assigns a brand-new band to a section before any save', () => {
    const fresh = newBand();
    const body = toPutPricingBody([fresh], assignSection({}, SECTION_A, fresh.key));

    expect(body.priceBands).toEqual([
      { key: fresh.key, name: '', tier: 'standard', priceCents: 0 },
    ]);
    expect(body.assignments).toEqual([{ sectionId: SECTION_A, bandKey: fresh.key }]);
  });

  it('drops an assignment whose band is gone rather than sending a dangling key', () => {
    const body = toPutPricingBody([band('kept')], { [SECTION_A]: 'kept', [SECTION_B]: 'vanished' });

    expect(body.assignments).toEqual([{ sectionId: SECTION_A, bandKey: 'kept' }]);
  });

  it('lets two sections share one band', () => {
    const body = toPutPricingBody([band('flat')], { [SECTION_A]: 'flat', [SECTION_B]: 'flat' });

    expect(body.assignments).toHaveLength(2);
    expect(new Set(body.assignments.map((a) => a.bandKey)).size).toBe(1);
  });
});

describe('removeBand', () => {
  it('unassigns the sections that used it, leaving a valid body', () => {
    const bands = [band('vip'), band('cheap', 1000)];
    const assignments = { [SECTION_A]: 'vip', [SECTION_B]: 'cheap' };

    const next = removeBand(bands, assignments, 'vip');

    expect(next.bands.map((b) => b.key)).toEqual(['cheap']);
    expect(next.assignments).toEqual({ [SECTION_B]: 'cheap' });
    expect(toPutPricingBody(next.bands, next.assignments).assignments).toEqual([
      { sectionId: SECTION_B, bandKey: 'cheap' },
    ]);
  });

  it('leaves the other bands alone', () => {
    const next = removeBand([band('a'), band('b')], { [SECTION_A]: 'b' }, 'a');

    expect(next.assignments).toEqual({ [SECTION_A]: 'b' });
  });
});

describe('bandUsage', () => {
  it('counts the sections a band prices', () => {
    expect(bandUsage({ [SECTION_A]: 'vip', [SECTION_B]: 'vip' }, 'vip')).toBe(2);
    expect(bandUsage({ [SECTION_A]: 'vip' }, 'cheap')).toBe(0);
  });
});

describe('assignSection', () => {
  it('removes the entry entirely when a section goes off sale', () => {
    expect(assignSection({ [SECTION_A]: 'vip' }, SECTION_A, null)).toEqual({});
  });

  it('replaces the band a section is on', () => {
    expect(assignSection({ [SECTION_A]: 'vip' }, SECTION_A, 'cheap')).toEqual({
      [SECTION_A]: 'cheap',
    });
  });
});

describe('seeding from saved pricing', () => {
  const saved: ShowPricing = {
    priceBands: [{ id: BAND_ID, name: 'Front VIP', tier: 'vip', priceCents: 9000 }],
    assignments: [{ sectionId: SECTION_A, bandId: BAND_ID }],
  };

  // The saved band's id becomes the local key, so the seeded state can be PUT straight back
  // without the organizer having to touch anything.
  it('round-trips saved pricing into a body that means the same thing', () => {
    const body = toPutPricingBody(seedBands(saved), seedAssignments(saved));

    expect(body.priceBands).toEqual([
      { key: BAND_ID, name: 'Front VIP', tier: 'vip', priceCents: 9000 },
    ]);
    expect(body.assignments).toEqual([{ sectionId: SECTION_A, bandKey: BAND_ID }]);
  });

  it('seeds an unpriced show as an empty form', () => {
    expect(seedBands({ priceBands: [], assignments: [] })).toEqual([]);
    expect(seedAssignments({ priceBands: [], assignments: [] })).toEqual({});
  });
});

describe('sectionSummary', () => {
  const sections = [
    venueSection(SECTION_A, 'Parterre', 112),
    venueSection(SECTION_B, 'Balcony', 40),
  ];

  it('counts only assigned sections and sums only their seats', () => {
    expect(sectionSummary(sections, { [SECTION_A]: 'vip' })).toBe(
      '1 OF 2 SECTIONS ON SALE · 112 SEATS',
    );
  });

  it('reads zero when nothing is priced', () => {
    expect(sectionSummary(sections, {})).toBe('0 OF 2 SECTIONS ON SALE · 0 SEATS');
  });

  it('sums across sections when both are on sale', () => {
    expect(sectionSummary(sections, { [SECTION_A]: 'vip', [SECTION_B]: 'vip' })).toBe(
      '2 OF 2 SECTIONS ON SALE · 152 SEATS',
    );
  });
});
