import { ConflictException, HttpException } from '@nestjs/common';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ORGANIZER_MESSAGE_PATTERNS, RPC_EXCHANGE } from '@tickethub/contracts';
import { rpcErrorReplyHandler, rpcRequest } from './rpc';

function channelSpy() {
  const published: Array<{ replyTo: string; body: unknown; correlationId?: string }> = [];
  const acked: unknown[] = [];
  const channel = {
    publish: (_ex: string, replyTo: string, body: Buffer, opts: { correlationId?: string }) =>
      published.push({
        replyTo,
        body: JSON.parse(body.toString()),
        correlationId: opts.correlationId,
      }),
    ack: (m: unknown) => acked.push(m),
  } as never;
  return { channel, published, acked };
}

function msg(replyTo?: string) {
  return { properties: { replyTo, correlationId: 'c1' } } as never;
}

describe('rpcErrorReplyHandler', () => {
  it('replies with the HttpException status + message, then acks', () => {
    const { channel, published, acked } = channelSpy();

    rpcErrorReplyHandler(channel, msg('reply.q'), new ConflictException('nope'));

    expect(published[0]).toEqual({
      replyTo: 'reply.q',
      correlationId: 'c1',
      body: { __rpcError: { status: 409, message: 'nope' } },
    });
    expect(acked).toHaveLength(1);
  });

  it('maps a non-HttpException to 500', () => {
    const { channel, published } = channelSpy();

    rpcErrorReplyHandler(channel, msg('reply.q'), new Error('boom'));

    expect(published[0].body).toEqual({ __rpcError: { status: 500, message: 'boom' } });
  });

  it('acks without replying when there is no replyTo', () => {
    const { channel, published, acked } = channelSpy();

    rpcErrorReplyHandler(channel, msg(undefined), new Error('boom'));

    expect(published).toHaveLength(0);
    expect(acked).toHaveLength(1);
  });
});

describe('rpcRequest', () => {
  it('returns a normal response and routes over the RPC exchange', async () => {
    const request = jest.fn().mockResolvedValue({ id: 'o1' });
    const amqp = { request } as unknown as AmqpConnection;

    const res = await rpcRequest(amqp, 'orders.get', { userId: 'u1', orderId: 'o1' });

    expect(res).toEqual({ id: 'o1' });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ exchange: RPC_EXCHANGE, routingKey: 'orders.get' }),
    );
  });

  it('rethrows an error envelope as the matching HttpException', async () => {
    const amqp = {
      request: jest
        .fn()
        .mockResolvedValue({ __rpcError: { status: 404, message: 'Order not found' } }),
    } as unknown as AmqpConnection;

    const payload = { userId: 'u1', orderId: 'o1' };

    await expect(rpcRequest(amqp, 'orders.get', payload)).rejects.toMatchObject({
      status: 404,
    });
    await expect(rpcRequest(amqp, 'orders.get', payload)).rejects.toBeInstanceOf(HttpException);
  });

  // The registry is a compile-time guarantee, so its test is a compile-time one: ts-jest
  // type-checks this file, and an @ts-expect-error that stops erroring fails the run.
  it('rejects a wrong payload, an unknown routing key and a misspelled result field', async () => {
    const amqp = { request: jest.fn().mockResolvedValue([]) } as unknown as AmqpConnection;

    // @ts-expect-error — CAPACITY takes { showIds }, not a number
    await rpcRequest(amqp, ORGANIZER_MESSAGE_PATTERNS.CAPACITY, 123);

    // @ts-expect-error — not a routing key in RpcContracts
    await rpcRequest(amqp, 'organizer.capacty', { showIds: ['s1'] });

    const capacities = await rpcRequest(amqp, ORGANIZER_MESSAGE_PATTERNS.CAPACITY, {
      showIds: ['s1'],
    });

    // @ts-expect-error — the result is typed, so a typo on it does not compile
    capacities.map((c) => c.capacityy);
  });
});
