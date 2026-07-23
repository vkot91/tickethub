import { z } from 'zod';

const uuid = z.string().uuid();

export const ticketPdfReadySchema = z.object({
  messageId: uuid,
  orderId: uuid,
  userId: uuid,
});
export type TicketPdfReadyEvent = z.infer<typeof ticketPdfReadySchema>;
