import { TICKETS_MESSAGE_PATTERNS } from '@tickethub/contracts';

import { GatewayUserTicketsController } from './tickets.controller';

type RpcCall = { routingKey: string; payload: unknown };

const amqpReturning = (result: unknown) => ({
  request: jest.fn(async (_call: RpcCall) => result),
});

const responseSpy = () => ({
  setHeader: jest.fn(),
  redirect: jest.fn(),
});

describe('GatewayUserTicketsController', () => {
  describe('list', () => {
    it('asks fulfillment for the authenticated caller’s tickets', async () => {
      const list = { items: [] };
      const amqp = amqpReturning(list);
      const controller = new GatewayUserTicketsController(amqp as never);

      await expect(controller.list({ user: { id: 'u1' } })).resolves.toBe(list);

      // The userId comes from the verified JWT, never from the request body or a query param.
      expect(amqp.request).toHaveBeenCalledWith(
        expect.objectContaining({
          routingKey: TICKETS_MESSAGE_PATTERNS.LIST,
          payload: { userId: 'u1' },
        }),
      );
    });
  });

  describe('pdf', () => {
    const SIGNED_URL = 'https://localhost:9000/tickets/o1.pdf?X-Amz-Signature=abc';

    it('redirects to a freshly minted signed url instead of streaming the bytes', async () => {
      const amqp = amqpReturning({ url: SIGNED_URL });
      const res = responseSpy();

      await new GatewayUserTicketsController(amqp as never).pdf(
        { user: { id: 'u1' } },
        't1',
        res as never,
      );

      expect(amqp.request).toHaveBeenCalledWith(
        expect.objectContaining({
          routingKey: TICKETS_MESSAGE_PATTERNS.PDF_URL,
          payload: { userId: 'u1', ticketId: 't1' },
        }),
      );
      expect(res.redirect).toHaveBeenCalledWith(302, SIGNED_URL);
    });

    // The Location header carries a 60-second credential: a cached redirect would hand out a
    // dead link a minute later, and a shared cache would hand it to the wrong person.
    it('forbids caching the redirect', async () => {
      const amqp = amqpReturning({ url: SIGNED_URL });
      const res = responseSpy();

      await new GatewayUserTicketsController(amqp as never).pdf(
        { user: { id: 'u1' } },
        't1',
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('does not redirect when fulfillment refuses the ticket', async () => {
      const amqp = { request: jest.fn().mockRejectedValue(new Error('Ticket not found')) };
      const res = responseSpy();

      await expect(
        new GatewayUserTicketsController(amqp as never).pdf(
          { user: { id: 'u2' } },
          't1',
          res as never,
        ),
      ).rejects.toThrow('Ticket not found');

      expect(res.redirect).not.toHaveBeenCalled();
    });
  });
});
