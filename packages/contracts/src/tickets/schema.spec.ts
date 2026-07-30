import { TICKET_ROUTING_KEYS } from './wire';
import { ticketPdfReadySchema } from './schema';

describe('ticket contracts', () => {
  it('routing key is stable', () => {
    expect(TICKET_ROUTING_KEYS.TICKET_PDF_READY).toBe('ticket.pdf_ready');
  });

  it('parses a ticket.pdf_ready event', () => {
    // No messageId: the transport stamps it, so the schema is domain fields only.
    const event = {
      orderId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
    };
    expect(ticketPdfReadySchema.parse(event)).toEqual(event);
  });

  it('rejects a non-uuid orderId', () => {
    expect(() => ticketPdfReadySchema.parse({ orderId: 'x', userId: 'x' })).toThrow();
  });
});
