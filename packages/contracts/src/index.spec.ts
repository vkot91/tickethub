import * as contracts from './index';

// Every service imports from the barrel and nothing else, so a folder that moves without its
// `export *` line compiles here and breaks at the first consumer. This walks the surface the
// refactor rearranged: one map per audience per service, plus the audience-free event maps.
describe('@tickethub/contracts barrel', () => {
  it.each([
    // Buyer surfaces.
    'SHOWS_MESSAGE_PATTERNS',
    'ORDERS_MESSAGE_PATTERNS',
    'TICKETS_MESSAGE_PATTERNS',
    // Console surfaces — one per service it reaches into, plus the account.
    'ORGANIZER_PROFILE_MESSAGE_PATTERNS',
    'ORGANIZER_SHOWS_MESSAGE_PATTERNS',
    'ORGANIZER_ORDERS_MESSAGE_PATTERNS',
    'ORGANIZER_TICKETS_MESSAGE_PATTERNS',
    // Audience-free.
    'AUTH_MESSAGE_PATTERNS',
    'VENUES_MESSAGE_PATTERNS',
    'PAYMENTS_MESSAGE_PATTERNS',
    'SHOW_ROUTING_KEYS',
    'ORDER_ROUTING_KEYS',
    'TICKET_ROUTING_KEYS',
    'PAYMENT_ROUTING_KEYS',
    'EVENTS_QUEUES',
  ])('re-exports %s', (name) => {
    expect(contracts).toHaveProperty(name);
  });

  it('re-exports a schema from each audience folder', () => {
    expect(contracts.catalogQuerySchema).toBeDefined();
    expect(contracts.putPricingSchema).toBeDefined();
    expect(contracts.createOrderSchema).toBeDefined();
    expect(contracts.orderStatsSchema).toBeDefined();
    expect(contracts.ticketSchema).toBeDefined();
    expect(contracts.showStatsSchema).toBeDefined();
  });

  // The old un-namespaced console keys are gone, not aliased. A consumer still importing one
  // would fail to compile; this catches a re-export that quietly brought it back.
  it.each(['ORGANIZER_MESSAGE_PATTERNS'])('no longer exports %s', (name) => {
    expect(contracts).not.toHaveProperty(name);
  });
});
