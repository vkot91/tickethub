import type { TicketList, TicketPdfUrl } from './schema';
import type { Rpc } from '../../shape';

/** A buyer reading their own tickets. */
export const TICKETS_MESSAGE_PATTERNS = {
  LIST: 'tickets.list',
  PDF_URL: 'tickets.pdfUrl',
} as const;

export interface TicketsRpcContracts {
  [TICKETS_MESSAGE_PATTERNS.LIST]: Rpc<{ payload: { userId: string }; result: TicketList }>;
  [TICKETS_MESSAGE_PATTERNS.PDF_URL]: Rpc<{
    payload: { userId: string; ticketId: string };
    result: TicketPdfUrl;
  }>;
}
