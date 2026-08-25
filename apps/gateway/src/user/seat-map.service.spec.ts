import { ORDERS_MESSAGE_PATTERNS, SHOWS_MESSAGE_PATTERNS } from '@tickethub/contracts';

import { GatewayUserSeatMapService } from './seat-map.service';

const seatMap = { showId: 'e1', sections: [] };

function amqpFake(statuses: Record<string, string> | Error) {
  return {
    request: jest.fn(({ routingKey }: { routingKey: string }) => {
      if (routingKey === SHOWS_MESSAGE_PATTERNS.SEAT_MAP) return Promise.resolve(seatMap);
      if (statuses instanceof Error) return Promise.reject(statuses);

      return Promise.resolve(statuses);
    }),
  };
}

describe('GatewayUserSeatMapService', () => {
  it('merges the shows geometry with the orders availability', async () => {
    const amqp = amqpFake({ s1: 'held' });
    const service = new GatewayUserSeatMapService(amqp as never);

    await expect(service.get('e1')).resolves.toEqual({ ...seatMap, statuses: { s1: 'held' } });
  });

  it('asks both services with the show id', async () => {
    const amqp = amqpFake({});

    await new GatewayUserSeatMapService(amqp as never).get('e1');

    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: SHOWS_MESSAGE_PATTERNS.SEAT_MAP,
        payload: { id: 'e1' },
      }),
    );
    expect(amqp.request).toHaveBeenCalledWith(
      expect.objectContaining({
        routingKey: ORDERS_MESSAGE_PATTERNS.SEAT_STATUS,
        payload: { showId: 'e1' },
      }),
    );
  });

  // An empty status map and a *failed* status call look identical to the browser, and one of them
  // silently invites a 409 on every click.
  it('fails the request when orders cannot answer, rather than showing every seat free', async () => {
    const service = new GatewayUserSeatMapService(amqpFake(new Error('orders down')) as never);

    await expect(service.get('e1')).rejects.toThrow();
  });
});
