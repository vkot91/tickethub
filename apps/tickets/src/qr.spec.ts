import { deriveTicketId, renderQrPng, signTicketToken, verifyTicketToken } from './qr';

describe('signTicketToken / verifyTicketToken', () => {
  const secret = 'top-secret';

  it('roundtrips: verifying a signed token returns the original ticketId', () => {
    const ticketId = 'ticket-123';

    const token = signTicketToken(ticketId, secret);

    expect(verifyTicketToken(token, secret)).toBe(ticketId);
  });

  it('rejects a token with a tampered signature', () => {
    const token = signTicketToken('ticket-123', secret);
    const [ticketId, signature] = [
      token.slice(0, token.lastIndexOf('.')),
      token.slice(token.lastIndexOf('.') + 1),
    ];
    const tamperedToken = `${ticketId}.${signature.slice(0, -1)}x`;

    expect(verifyTicketToken(tamperedToken, secret)).toBeNull();
  });

  it('rejects a token with a tampered ticketId', () => {
    const token = signTicketToken('ticket-123', secret);
    const signature = token.slice(token.lastIndexOf('.') + 1);
    const tamperedToken = `ticket-999.${signature}`;

    expect(verifyTicketToken(tamperedToken, secret)).toBeNull();
  });

  it('rejects a token verified with the wrong secret', () => {
    const token = signTicketToken('ticket-123', secret);

    expect(verifyTicketToken(token, 'wrong-secret')).toBeNull();
  });

  it('rejects a malformed token with no dot separator', () => {
    expect(verifyTicketToken('no-dot-here', secret)).toBeNull();
  });

  it('does not confuse a ticketId containing a dot when splitting on the last dot', () => {
    const ticketId = 'ticket.with.dots';

    const token = signTicketToken(ticketId, secret);

    expect(verifyTicketToken(token, secret)).toBe(ticketId);
  });
});

describe('renderQrPng', () => {
  it('renders a real PNG buffer', async () => {
    const token = signTicketToken('ticket-123', 'top-secret');

    const png = await renderQrPng(token);

    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
});

describe('deriveTicketId', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const seatId = '22222222-2222-4222-8222-222222222222';

  it('is a valid v5-shaped uuid so it fits the uuid column', () => {
    expect(deriveTicketId(orderId, seatId)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  // The property the whole redelivery story rests on: a retry must re-sign the same tokens and
  // re-render a byte-identical PDF, or the overwrite at the fixed S3 key would desync the
  // document from the rows.
  it('is stable across calls for the same order and seat', () => {
    expect(deriveTicketId(orderId, seatId)).toBe(deriveTicketId(orderId, seatId));
  });

  it('differs per seat within an order', () => {
    const other = '33333333-3333-4333-8333-333333333333';

    expect(deriveTicketId(orderId, seatId)).not.toBe(deriveTicketId(orderId, other));
  });

  it('differs per order for the same seat', () => {
    const other = '44444444-4444-4444-8444-444444444444';

    expect(deriveTicketId(orderId, seatId)).not.toBe(deriveTicketId(other, seatId));
  });
});
