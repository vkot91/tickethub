import { z } from 'zod';

// A buyer's own tickets. The console's only question about tickets is a check-in *count* — a bare
// number, so `../organizer` needs a wire file and no schema of its own.

const uuid = z.string().uuid();

/**
 * One ticket = one seat. `showTitle`/`showStartsAt`/`venueName` live in Shows and are added at
 * read time (a rescheduled show must display its new date, so they are never snapshotted);
 * `seatLabel` and `tier` are snapshotted at issue time because they are what was sold.
 */
export const ticketSchema = z.object({
  id: uuid,
  orderId: uuid,
  showTitle: z.string(),
  showStartsAt: z.string(),
  venueName: z.string().nullable(),
  seatLabel: z.string(),
  tier: z.string(),
  /** Human-readable, display only — derived from the ticket id, never used for lookup. */
  code: z.string(),
  /** The HMAC token the gate scanner reads. The UI renders it client-side. */
  qrToken: z.string(),
  /**
   * A stable **gateway-relative** path (`/tickets/:id/pdf`), NOT a signed S3 URL — that endpoint
   * authorizes the caller and 302s to a 60-second presigned URL minted at click time. So this
   * value is safe to cache indefinitely, and no perishable credential ever enters a response
   * cache. The client prefixes its own API base. `null` when no PDF exists for the ticket.
   */
  pdfUrl: z.string().nullable(),
  status: z.enum(['active', 'checked_in', 'void']),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const ticketListSchema = z.object({ items: z.array(ticketSchema) });
export type TicketList = z.infer<typeof ticketListSchema>;

export const ticketPdfUrlSchema = z.object({ url: z.string().url() });
export type TicketPdfUrl = z.infer<typeof ticketPdfUrlSchema>;
