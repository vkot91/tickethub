import { Logger } from '@nestjs/common';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { ORDER_ROUTING_KEYS, type EventEnvelope } from '@tickethub/contracts';
import { TicketsController } from './tickets.controller';

describe('TicketsController', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('order.paid delegates to handleOrderPaid with the exact event', async () => {
    const service = { handleOrderPaid: jest.fn().mockResolvedValue(undefined) };
    const controller = new TicketsController(service as never);
    const event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID> = {
      messageId: 'm1',
      orderId: 'ord1',
      showId: 'ev1',
    } as never;

    await controller.onOrderPaid(event);

    expect(service.handleOrderPaid).toHaveBeenCalledWith(event);
  });

  it('dead-letters (Nack, no requeue) when handleOrderPaid fails', async () => {
    const service = {
      handleOrderPaid: jest.fn().mockRejectedValue(new Error('render failed')),
    };
    const controller = new TicketsController(service as never);
    const event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID> = {
      messageId: 'm1',
      orderId: 'ord1',
      showId: 'ev1',
    } as never;

    const result = await controller.onOrderPaid(event);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  // The app has no HTTP surface, so nothing else would record the dropped ticket.
  it('logs the cause, the order id and the message id before dead-lettering', async () => {
    const renderError = new Error('render failed');
    const service = { handleOrderPaid: jest.fn().mockRejectedValue(renderError) };
    const controller = new TicketsController(service as never);
    const event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID> = {
      messageId: 'm1',
      orderId: 'ord1',
      showId: 'ev1',
    } as never;

    await controller.onOrderPaid(event);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', orderId: 'ord1', err: renderError }),
      expect.stringContaining('ord1'),
    );
  });
});

describe('TicketsController RPCs', () => {
  it('lists only the calling user’s tickets', async () => {
    const list = { items: [] };
    const service = { listForUser: jest.fn().mockResolvedValue(list) };
    const controller = new TicketsController(service as never);

    await expect(controller.list({ userId: 'u1' })).resolves.toBe(list);
    expect(service.listForUser).toHaveBeenCalledWith('u1');
  });

  // The userId must reach the service: it is what turns "any ticket id" into "your ticket".
  it('passes both the caller and the ticket to the pdf-url mint', async () => {
    const service = { pdfUrlFor: jest.fn().mockResolvedValue({ url: 'https://minio.test/x.pdf' }) };
    const controller = new TicketsController(service as never);

    await controller.pdfUrl({ userId: 'u1', ticketId: 't1' });

    expect(service.pdfUrlFor).toHaveBeenCalledWith('u1', 't1');
  });

  it('lets an unauthorized pdf-url request reject rather than returning a url', async () => {
    const service = { pdfUrlFor: jest.fn().mockRejectedValue(new Error('Ticket not found')) };
    const controller = new TicketsController(service as never);

    await expect(controller.pdfUrl({ userId: 'u2', ticketId: 't1' })).rejects.toThrow(
      'Ticket not found',
    );
  });
});
