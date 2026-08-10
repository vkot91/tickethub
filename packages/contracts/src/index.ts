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
//
// **Types are re-exported wholesale; a Zod schema is re-exported only when a caller `.parse()`s
// it.** Most schemas exist to derive a type and are never run — publishing them anyway made the
// barrel advertise a validation surface that does not exist. They stay in their own file, still
// covered by its spec; the value exports at the bottom are exactly what a consumer can run.
export * from './shape';
export * from './transport';
export * from './registry';

// Wire and routing-key maps are constants, not schemas — every key in them is meant to be reached.
export * from './auth/wire';
export * from './venues/wire';
export * from './payments/wire';
export * from './shows/user/wire';
export * from './shows/organizer/wire';
export * from './orders/user/wire';
export * from './orders/organizer/wire';
export * from './tickets/user/wire';
export * from './tickets/organizer/wire';

export type * from './auth/schema';
export type * from './venues/schema';
export type * from './payments/schema';
export type * from './payments/events';
export type * from './shows/schema';
export type * from './shows/events';
export type * from './shows/user/schema';
export type * from './shows/organizer/schema';
export type * from './orders/schema';
export type * from './orders/events';
export type * from './orders/user/schema';
export type * from './orders/organizer/schema';
export type * from './tickets/events';
export type * from './tickets/user/schema';
export type * from './tickets/organizer/schema';
export type * from './gateway/organizer/schema';

export { PAYMENT_ROUTING_KEYS } from './payments/events';
export { SHOW_ROUTING_KEYS } from './shows/events';
export { ORDER_ROUTING_KEYS } from './orders/events';
export { TICKET_ROUTING_KEYS } from './tickets/events';

export {
  authTokensSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  userPayloadSchema,
} from './auth/schema';
export { venueDetailSchema, venueSummarySchema } from './venues/schema';
export { createPaymentIntentSchema, paymentIntentResponseSchema } from './payments/schema';
export { SEAT_TIERS, showSummarySchema } from './shows/schema';
export {
  catalogPageSchema,
  catalogQuerySchema,
  seatMapSchema,
  showDetailSchema,
} from './shows/user/schema';
export {
  becomeOrganizerSchema,
  createShowSchema,
  organizerShowSchema,
  organizerShowsQuerySchema,
  POSTER_CONTENT_TYPES,
  posterUploadRequestSchema,
  posterUploadUrlSchema,
  publishChecklistSchema,
  putPricingSchema,
  showNameSchema,
  showPricingSchema,
  updateShowSchema,
} from './shows/organizer/schema';
export {
  createOrderSchema,
  orderListQuerySchema,
  orderListSchema,
  orderResponseSchema,
} from './orders/user/schema';
export { orderStatsSchema } from './orders/organizer/schema';
export { ticketListSchema, ticketSchema } from './tickets/user/schema';
export { checkInResultSchema, checkInSchema } from './tickets/organizer/schema';
export {
  recentOrdersSchema,
  showStatsQuerySchema,
  showStatsSchema,
} from './gateway/organizer/schema';
