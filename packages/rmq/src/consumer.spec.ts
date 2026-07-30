import { Nack } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_EXCHANGE, RPC_EXCHANGE } from '@tickethub/contracts';
import { eventSub, rpcSub, nackOnError } from './consumer';

describe('eventSub', () => {
  it('binds the routing key to its own queue with a matching DLX', () => {
    expect(eventSub('order.paid', 'orders.payment-succeeded')).toEqual({
      exchange: EVENTS_EXCHANGE,
      routingKey: 'order.paid',
      queue: 'orders.payment-succeeded',
      queueOptions: { deadLetterExchange: 'orders.payment-succeeded.dlx' },
    });
  });

  // ts-jest type-checks this file, so each directive below is an assertion that the argument is a
  // closed set. Delete one and the run fails on an unused directive.
  it('takes only a real routing key and a real queue', () => {
    // @ts-expect-error — 'order.reticulated' is not an event anyone publishes
    expect(() => eventSub('order.reticulated', 'orders.payment-succeeded')).not.toThrow();

    // @ts-expect-error — a queue not in EVENTS_QUEUES would bind and then receive nothing
    expect(() => eventSub('order.paid', 'orders.payment-succeded')).not.toThrow();
  });
});

describe('rpcSub', () => {
  it('binds the pattern as both routing key and queue on the RPC exchange', () => {
    expect(rpcSub('orders.stats')).toEqual({
      exchange: RPC_EXCHANGE,
      routingKey: 'orders.stats',
      queue: 'orders.stats',
    });
  });

  it('takes only a real RPC pattern', () => {
    // @ts-expect-error — 'show.published' is an event, not something a handler can answer
    expect(() => rpcSub('show.published')).not.toThrow();
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
