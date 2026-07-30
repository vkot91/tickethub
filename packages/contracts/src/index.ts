// One folder per **service**, and inside it one folder per **audience**:
//
//   shows/schema.ts                 shapes both audiences extend — nothing else
//   shows/events.ts                 what Shows publishes: routing keys + payloads (no audience)
//   shows/user/{schema,wire}        the buyer catalog
//   shows/organizer/{schema,wire}   the console
//
// The service is the outer folder because that is the deploy seam and where events belong; the
// audience is the inner one because that is what decides the guard. A stats shape then has nowhere
// to land except an `organizer/` folder, and a map cannot quietly grow a second audience's key —
// which is what `ORDERS_MESSAGE_PATTERNS.STATS` used to be. `admin/` arrives as a sibling.
//
// A service with one audience (auth, venues, payments) has no subfolders. Add them when a second
// audience actually turns up, not before.
//
// Flat barrel: every consumer imports from `@tickethub/contracts` and nothing else, so moving a
// type between files here is not a change anywhere else.
export * from './shape';
export * from './transport';
export * from './registry';

export * from './auth/schema';
export * from './auth/wire';
export * from './venues/schema';
export * from './venues/wire';
export * from './payments/schema';
export * from './payments/events';
export * from './payments/wire';

export * from './shows/schema';
export * from './shows/events';
export * from './shows/user/schema';
export * from './shows/user/wire';
export * from './shows/organizer/schema';
export * from './shows/organizer/wire';

export * from './orders/schema';
export * from './orders/events';
export * from './orders/user/schema';
export * from './orders/user/wire';
export * from './orders/organizer/schema';
export * from './orders/organizer/wire';

export * from './tickets/events';
export * from './tickets/user/schema';
export * from './tickets/user/wire';
export * from './tickets/organizer/wire';

export * from './organizer/schema';
export * from './organizer/wire';
