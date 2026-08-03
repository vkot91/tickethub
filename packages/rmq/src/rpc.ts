import type { AmqpConnection, MessageErrorHandler } from '@golevelup/nestjs-rabbitmq';
import { HttpException } from '@nestjs/common';

import { RPC_EXCHANGE, type RpcKey, type RpcPayload, type RpcResult } from '@tickethub/contracts';

import { getRequestId } from './request-context';

// golevelup does NOT reply when an RPC handler throws — it runs the error handler and, by
// default, requeues, so the caller's request would hang until timeout. The old @nestjs/
// microservices transport instead serialized the exception into the reply. This module keeps
// that behaviour: the server replies with an error envelope; the gateway rethrows it as HTTP.

const RPC_ERROR = '__rpcError';
type RpcErrorEnvelope = { [RPC_ERROR]: { status: number; message: string } };

function isRpcError(v: unknown): v is RpcErrorEnvelope {
  return typeof v === 'object' && v !== null && RPC_ERROR in v;
}

// Default RPC error handler wired into rmqConfig: reply to the caller with {status, message}
// pulled off the thrown HttpException (falls back to 500), then ack so it doesn't requeue.
export const rpcErrorReplyHandler: MessageErrorHandler = (channel, msg, error) => {
  const { replyTo, correlationId } = msg.properties;
  const status = error instanceof HttpException ? error.getStatus() : 500;
  const message = error instanceof Error ? error.message : 'Internal error';

  if (replyTo) {
    const envelope: RpcErrorEnvelope = { [RPC_ERROR]: { status, message } };
    channel.publish('', replyTo, Buffer.from(JSON.stringify(envelope)), { correlationId });
  }
  channel.ack(msg);
};

// Gateway-side RPC call: request over the RPC exchange, propagate the request id, and rethrow
// a server error envelope as the matching HttpException so the gateway maps it to a status.
//
// The routing key drives both other types: `RpcContracts` in @tickethub/contracts states each
// key's payload and result, so a call site names a key and passes no type argument at all.
export async function rpcRequest<K extends RpcKey>(
  amqp: AmqpConnection,
  routingKey: K,
  payload: RpcPayload<K>,
): Promise<RpcResult<K>> {
  const response = await amqp.request<RpcResult<K> | RpcErrorEnvelope>({
    exchange: RPC_EXCHANGE,
    routingKey,
    payload,
    headers: { 'x-request-id': getRequestId() },
  });

  if (isRpcError(response)) {
    const { status, message } = response[RPC_ERROR];
    throw new HttpException(message, status);
  }

  return response;
}
