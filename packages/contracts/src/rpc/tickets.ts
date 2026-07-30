import type { TicketList, TicketPdfUrl } from '../dto/tickets';
import type { TICKETS_MESSAGE_PATTERNS } from '../events';
import type { Rpc } from './shape';

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
