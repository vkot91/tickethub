import { priceTierSchema } from './schema';

describe('priceTierSchema', () => {
  // The band is a fixed vocabulary shared with the seat map and the db enum; a free-form
  // string here would let a typo through and silently render an uncoloured dot.
  it('rejects a tier outside the three bands', () => {
    expect(() =>
      priceTierSchema.parse({
        id: crypto.randomUUID(),
        tier: 'platinum',
        name: 'Platinum',
        priceCents: 100,
        currency: 'usd',
      }),
    ).toThrow();
  });
});
