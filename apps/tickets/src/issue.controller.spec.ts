import { Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from '@nestjs/common';

import { ORDER_ROUTING_KEYS, type EventEnvelope } from '@tickethub/contracts';

import { TicketIssueController } from './issue.controller';

describe('TicketIssueController', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('order.paid delegates to issue with the exact event', async () => {
    const service = { issue: jest.fn().mockResolvedValue(undefined) };
    const controller = new TicketIssueController(service as never);
    const event: EventEnvelope<typeof ORDER_ROUTING_KEYS.ORDER_PAID> = {
      messageId: 'm1',
      orderId: 'ord1',
      showId: 'ev1',
    } as never;

    await controller.onOrderPaid(event);

    expect(service.issue).toHaveBeenCalledWith(event);
  });

  it('dead-letters (Nack, no requeue) when issue fails', async () => {
    const service = {
      issue: jest.fn().mockRejectedValue(new Error('render failed')),
    };
    const controller = new TicketIssueController(service as never);
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
    const service = { issue: jest.fn().mockRejectedValue(renderError) };
    const controller = new TicketIssueController(service as never);
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
