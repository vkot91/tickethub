import { type TicketList, ticketListSchema } from '@tickethub/contracts';

import { clientApi } from '@tickethub/web-kit';

export const ticketKeys = {
  all: ['tickets'] as const,
  list: () => [...ticketKeys.all, 'list'] as const,
};

export { ticketSchema, ticketListSchema } from '@tickethub/contracts';
export type { Ticket, TicketList } from '@tickethub/contracts';

export function fetchTickets(): Promise<TicketList> {
  return clientApi('/tickets', {}, ticketListSchema);
}
