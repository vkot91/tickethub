import { HttpException } from '@nestjs/common';
import type { AmqpConnection, MessageErrorHandler } from '@golevelup/nestjs-rabbitmq';
import { RPC_EXCHANGE } from '@tickethub/contracts';
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
export async function rpcRequest<T>(
  amqp: AmqpConnection,
  routingKey: string,
  payload: unknown,
): Promise<T> {
  const response = await amqp.request<T | RpcErrorEnvelope>({
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
