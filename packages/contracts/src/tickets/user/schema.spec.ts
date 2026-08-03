import { ticketPdfUrlSchema, ticketSchema } from './schema';
import { TICKETS_MESSAGE_PATTERNS } from './wire';

const UUID = '44444444-4444-4444-4444-444444444444';

const ticket = {
  id: UUID,
  orderId: UUID,
  showTitle: 'Hamlet',
  showStartsAt: '2026-08-01T19:00:00.000Z',
  venueName: 'The Globe',
  seatLabel: 'A12',
  tier: 'vip',
  code: 'TH-ABC123',
  qrToken: 'signed.token',
  pdfUrl: '/tickets/44444444-4444-4444-4444-444444444444/pdf',
  status: 'active',
};

describe('buyer tickets wire names', () => {
  it('mirrors each key onto its wire value', () => {
    expect(TICKETS_MESSAGE_PATTERNS.LIST).toBe('tickets.list');
    expect(TICKETS_MESSAGE_PATTERNS.PDF_URL).toBe('tickets.pdfUrl');
  });
});

describe('ticketSchema', () => {
  it('parses a ticket with a gateway-relative pdf path', () => {
    expect(ticketSchema.parse(ticket)).toEqual(ticket);
  });

  // The path is deliberately not a URL — a signed S3 link here would be cached until it expired.
  it('accepts a null pdfUrl for a ticket whose PDF has not been rendered yet', () => {
    expect(ticketSchema.parse({ ...ticket, pdfUrl: null }).pdfUrl).toBeNull();
  });

  it('rejects a status outside the three the gate understands', () => {
    expect(() => ticketSchema.parse({ ...ticket, status: 'refunded' })).toThrow();
  });
});

describe('ticketPdfUrlSchema', () => {
  // This one *is* the presigned URL the gateway 302s to, so it must be absolute.
  it('requires an absolute url', () => {
    expect(() => ticketPdfUrlSchema.parse({ url: '/tickets/x/pdf' })).toThrow();
    expect(ticketPdfUrlSchema.parse({ url: 'https://minio.local/a.pdf' }).url).toBeDefined();
  });
});
