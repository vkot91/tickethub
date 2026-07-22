import { ConflictException, HttpException } from '@nestjs/common';
import type { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RPC_EXCHANGE } from '@tickethub/contracts';
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

    const res = await rpcRequest<{ id: string }>(amqp, 'orders.get', { orderId: 'o1' });

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

    await expect(rpcRequest(amqp, 'orders.get', {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(rpcRequest(amqp, 'orders.get', {})).rejects.toBeInstanceOf(HttpException);
  });
});
