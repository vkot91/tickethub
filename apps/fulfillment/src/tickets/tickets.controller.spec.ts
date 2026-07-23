import { Logger } from '@nestjs/common';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import type { OrderPaidEvent } from '@tickethub/contracts';
import { TicketsController } from './tickets.controller';

describe('TicketsController', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('order.paid delegates to handleOrderPaid with the exact event', async () => {
    const service = { handleOrderPaid: jest.fn().mockResolvedValue(undefined) };
    const controller = new TicketsController(service as never);
    const event: OrderPaidEvent = { messageId: 'm1', orderId: 'ord1', showId: 'ev1' } as never;

    await controller.onOrderPaid(event);

    expect(service.handleOrderPaid).toHaveBeenCalledWith(event);
  });

  it('dead-letters (Nack, no requeue) when handleOrderPaid fails', async () => {
    const service = {
      handleOrderPaid: jest.fn().mockRejectedValue(new Error('render failed')),
    };
    const controller = new TicketsController(service as never);
    const event: OrderPaidEvent = { messageId: 'm1', orderId: 'ord1', showId: 'ev1' } as never;

    const result = await controller.onOrderPaid(event);

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  // The app has no HTTP surface, so nothing else would record the dropped ticket.
  it('logs the cause, the order id and the message id before dead-lettering', async () => {
    const renderError = new Error('render failed');
    const service = { handleOrderPaid: jest.fn().mockRejectedValue(renderError) };
    const controller = new TicketsController(service as never);
    const event: OrderPaidEvent = { messageId: 'm1', orderId: 'ord1', showId: 'ev1' } as never;

    await controller.onOrderPaid(event);

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', orderId: 'ord1', err: renderError }),
      expect.stringContaining('ord1'),
    );
  });
});
