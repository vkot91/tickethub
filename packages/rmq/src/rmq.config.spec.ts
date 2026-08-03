import { EVENTS_EXCHANGE, RPC_EXCHANGE } from '@tickethub/contracts';

import { rmqConfig } from './rmq.config';

describe('rmqConfig', () => {
  it('declares the events (topic) and rpc (direct) exchanges', () => {
    const cfg = rmqConfig('amqp://localhost');

    expect(cfg.uri).toBe('amqp://localhost');
    expect(cfg.exchanges).toEqual([
      { name: EVENTS_EXCHANGE, type: 'topic' },
      { name: RPC_EXCHANGE, type: 'direct' },
    ]);
  });

  it('boots without waiting for the broker (resilience)', () => {
    expect(rmqConfig('amqp://localhost').connectionInitOptions).toEqual({ wait: false });
  });
});
