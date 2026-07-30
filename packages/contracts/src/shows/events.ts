import { z } from 'zod';

// What Shows publishes. Events have no audience — a consumer is another service, never a buyer or
// an organizer — so they sit beside `schema.ts` rather than inside `user/` or `organizer/`.
//
// Payloads carry domain fields only: `messageId` is stamped by the transport and reaches consumers
// as `EventEnvelope<K>`. See `../registry`.

export const showPublishedSchema = z.object({ showId: z.string().uuid() });
export type ShowPublishedEvent = z.infer<typeof showPublishedSchema>;

// Same shape as published today, declared separately on purpose: they are two different events
// and an alias would couple two things that have no reason to change together.
export const showCancelledSchema = z.object({ showId: z.string().uuid() });
export type ShowCancelledEvent = z.infer<typeof showCancelledSchema>;

export const SHOW_ROUTING_KEYS = {
  SHOW_PUBLISHED: 'show.published',
  SHOW_CANCELLED: 'show.cancelled',
} as const;

export interface ShowsEventContracts {
  [SHOW_ROUTING_KEYS.SHOW_PUBLISHED]: ShowPublishedEvent;
  [SHOW_ROUTING_KEYS.SHOW_CANCELLED]: ShowCancelledEvent;
}
