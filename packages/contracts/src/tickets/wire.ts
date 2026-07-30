import type { TicketList, TicketPdfReadyEvent, TicketPdfUrl } from './schema';
import type { Rpc } from '../shape';

export const TICKETS_MESSAGE_PATTERNS = {
  LIST: 'tickets.list',
  PDF_URL: 'tickets.pdfUrl',
  CHECKED_IN_COUNT: 'tickets.checkedInCount',
} as const;

export const TICKET_ROUTING_KEYS = {
  TICKET_PDF_READY: 'ticket.pdf_ready',
} as const;

export interface TicketsEventContracts {
  [TICKET_ROUTING_KEYS.TICKET_PDF_READY]: TicketPdfReadyEvent;
}

export interface TicketsRpcContracts {
  [TICKETS_MESSAGE_PATTERNS.LIST]: Rpc<{ payload: { userId: string }; result: TicketList }>;
  [TICKETS_MESSAGE_PATTERNS.PDF_URL]: Rpc<{
    payload: { userId: string; ticketId: string };
    result: TicketPdfUrl;
  }>;
  [TICKETS_MESSAGE_PATTERNS.CHECKED_IN_COUNT]: Rpc<{
    payload: { showIds: string[] };
    result: number;
  }>;
}
