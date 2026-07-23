import { Nack } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_EXCHANGE } from '@tickethub/contracts';
import { eventSub, nackOnError } from './consumer';

describe('eventSub', () => {
  it('binds the routing key to its own queue with a matching DLX', () => {
    expect(eventSub('order.paid', 'orders.payment-succeeded')).toEqual({
      exchange: EVENTS_EXCHANGE,
      routingKey: 'order.paid',
      queue: 'orders.payment-succeeded',
      queueOptions: { deadLetterExchange: 'orders.payment-succeeded.dlx' },
    });
  });
});

describe('nackOnError', () => {
  it('returns nothing when the handler succeeds', async () => {
    await expect(nackOnError(async () => 'ok')).resolves.toBeUndefined();
  });

  it('dead-letters (Nack, no requeue) when the handler throws', async () => {
    const result = await nackOnError(async () => {
      throw new Error('boom');
    });

    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });
});
