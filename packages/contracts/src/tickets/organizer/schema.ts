import { z } from 'zod';

// The console's own shapes for Fulfillment. The check-in *count* stays a bare number in `wire.ts`;
// a scan has a result worth naming, so it lives here.

/**
 * One scan at one gate.
 *
 * `code` is the QR's HMAC token, not a ticket id — the scanner never sees an id. `showId` is the
 * gate: which of the caller's shows is being admitted right now. It is **required**, because an
 * attendant is always standing at one specific door, and a scan scoped to "any show this organizer
 * owns" admits tomorrow's ticket at tonight's gate and burns it.
 */
export const checkInSchema = z.object({
  code: z.string().min(1),
  showId: z.string().uuid(),
});
export type CheckInDto = z.infer<typeof checkInSchema>;

/**
 * One scan's verdict.
 *
 * `wrongShow` is a distinct result from `invalid` on purpose: a genuine ticket for a different show
 * means "send them to the right door", while `invalid` means "this is not a ticket". Telling an
 * attendant the second when it is the first sends them hunting for a forgery that does not exist.
 *
 * It covers both ways a real ticket can be wrong here — another organizer's show, or another of the
 * caller's own shows — because from the gate's point of view those are the same situation, and
 * neither reveals anything about the show the ticket *is* for.
 *
 * `checkedInCount`/`capacity` describe **the gate**, not the scanned ticket, so they ride along
 * with every result — including a rejection — and the counter on screen stays correct without a
 * second request.
 */
export const checkInResultSchema = z.object({
  result: z.enum(['valid', 'used', 'invalid', 'wrongShow']),
  seatLabel: z.string().nullable(),
  showTitle: z.string().nullable(),
  /** When it was *first* admitted — on `used` this is the original scan, never now. */
  checkedInAt: z.string().nullable(),
  checkedInCount: z.number().int(),
  capacity: z.number().int(),
});
export type CheckInResult = z.infer<typeof checkInResultSchema>;
