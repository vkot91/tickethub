import type { AmqpConnection, RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { EVENTS_EXCHANGE, RPC_EXCHANGE } from '@tickethub/contracts';

import { getRequestId } from './request-context';
import { rpcErrorReplyHandler } from './rpc';

// Canonical golevelup config for the whole monorepo — one place so every service declares
// the same exchange topology (the reason `rmqClientOptions` existed for the old transport).
// Event persistence is set per-publish (publishStored).
//
// `waitForConnection`: RPC-only services (auth/shows/orders/payments) have no HTTP listener,
// so once bootstrap finishes nothing keeps the Node event loop alive — with wait:false they
// exit before the AMQP connection binds their handlers. They pass `true` so init() awaits the
// connection (the live socket then keeps the process running). The gateway keeps `false`: it
// stays alive via app.listen() and prefers to boot even if the broker is momentarily down.
export function rmqConfig(url: string, waitForConnection = false): RabbitMQConfig {
  return {
    uri: url,
    exchanges: [
      { name: EVENTS_EXCHANGE, type: 'topic' },
      { name: RPC_EXCHANGE, type: 'direct' },
    ],
    connectionInitOptions: { wait: waitForConnection },
    // our @RabbitRPC/@RabbitSubscribe handlers live on @Controller classes; golevelup only
    // scans providers unless this is set, so without it no handler ever binds to a queue.
    enableControllerDiscovery: true,
    // reply to the caller with an error envelope instead of hanging on a thrown RPC handler
    defaultRpcErrorHandler: rpcErrorReplyHandler,
  };
}

/**
 * Relay an already-stored outbox row — the only way an event reaches the broker.
 *
 * Untyped, and that is not a gap: a row comes back from Postgres as `text` + `json`, so the
 * relation between its routingKey and its payload is already gone by the time the poller sees it.
 * It was checked once, at `OutboxRepository.enqueue`, which is the only place an event is authored.
 * The narrow name keeps this from being reached for as a shortcut past that check.
 */
export function publishStored(
  amqp: AmqpConnection,
  routingKey: string,
  payload: unknown,
): Promise<void> {
  return Promise.resolve(
    // The single place a request id is stamped onto an outgoing domain event. Consumers read it
    // back via RequestIdInterceptor.
    amqp.publish(EVENTS_EXCHANGE, routingKey, payload, {
      persistent: true,
      headers: { 'x-request-id': getRequestId() },
    }),
  ).then(() => undefined);
}
