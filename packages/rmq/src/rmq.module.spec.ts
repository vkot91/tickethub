import { rmqClientOptions } from './rmq.module';

describe('rmqClientOptions', () => {
  it('declares the queue with a dead-letter exchange', () => {
    const opts = rmqClientOptions('orders.rpc', 'amqp://localhost') as {
      options: { queue: string; queueOptions: { durable: boolean; deadLetterExchange: string } };
    };
    expect(opts.options.queue).toBe('orders.rpc');
    expect(opts.options.queueOptions.durable).toBe(true);
    expect(opts.options.queueOptions.deadLetterExchange).toBe('orders.rpc.dlx');
  });
});
