// One folder per feature; inside each, `schema.ts` is the Zod source of truth and `wire.ts` is
// how that feature is addressed over RMQ (its message patterns, its routing keys, its slice of
// the registry). `schema.ts` never imports `wire.ts`, which is what keeps the graph acyclic.
//
// Flat barrel: every consumer imports from `@tickethub/contracts` and nothing else, so moving a
// type between files here is not a change anywhere else.
export * from './shape';
export * from './transport';
export * from './registry';

export * from './auth/schema';
export * from './auth/wire';
export * from './shows/schema';
export * from './shows/wire';
export * from './organizer/schema';
export * from './organizer/wire';
export * from './venues/schema';
export * from './venues/wire';
export * from './orders/schema';
export * from './orders/wire';
export * from './tickets/schema';
export * from './tickets/wire';
export * from './payments/schema';
export * from './payments/wire';
