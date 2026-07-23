import { signTicketToken, verifyTicketToken, renderQrPng } from './qr';

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
