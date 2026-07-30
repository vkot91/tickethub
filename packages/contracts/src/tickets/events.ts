import { z } from 'zod';

// What Fulfillment publishes. Audience-free — the consumer is another service.
// Payloads carry domain fields only; `messageId` is stamped by the transport and reaches consumers
// as `EventEnvelope<K>`. See `../registry`.

export const ticketPdfReadySchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type TicketPdfReadyEvent = z.infer<typeof ticketPdfReadySchema>;

export const TICKET_ROUTING_KEYS = {
  TICKET_PDF_READY: 'ticket.pdf_ready',
} as const;

export interface TicketsEventContracts {
  [TICKET_ROUTING_KEYS.TICKET_PDF_READY]: TicketPdfReadyEvent;
}
