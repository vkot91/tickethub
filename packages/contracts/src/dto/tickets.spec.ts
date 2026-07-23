import { TICKET_ROUTING_KEYS } from '../events';
import { ticketPdfReadySchema } from './tickets';

describe('ticket contracts', () => {
  it('routing key is stable', () => {
    expect(TICKET_ROUTING_KEYS.TICKET_PDF_READY).toBe('ticket.pdf_ready');
  });

  it('parses a ticket.pdf_ready event', () => {
    const event = {
      messageId: '11111111-1111-1111-1111-111111111111',
      orderId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
    };
    expect(ticketPdfReadySchema.parse(event)).toEqual(event);
  });

  it('rejects a non-uuid orderId', () => {
    expect(() =>
      ticketPdfReadySchema.parse({ messageId: 'x', orderId: 'x', userId: 'x' }),
    ).toThrow();
  });
});
