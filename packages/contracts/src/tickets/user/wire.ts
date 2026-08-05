import type { Rpc } from '../../shape';
import type { TicketList, TicketPdfUrl } from './schema';

/** A buyer reading their own tickets. */
export const TICKETS_MESSAGE_PATTERNS = {
  LIST: 'user.tickets.list',
  PDF_URL: 'user.tickets.pdfUrl',
} as const;

export interface TicketsRpcContracts {
  [TICKETS_MESSAGE_PATTERNS.LIST]: Rpc<{ payload: { userId: string }; result: TicketList }>;
  [TICKETS_MESSAGE_PATTERNS.PDF_URL]: Rpc<{
    payload: { userId: string; ticketId: string };
    result: TicketPdfUrl;
  }>;
}
