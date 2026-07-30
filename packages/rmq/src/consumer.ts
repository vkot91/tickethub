import { Nack } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_EXCHANGE, RPC_EXCHANGE } from '@tickethub/contracts';
import type { EventKey, EventQueue, RpcKey } from '@tickethub/contracts';

// Every RPC handler binds one queue named after its own message pattern — golevelup runs a
// consumer per @RabbitRPC, so a queue shared between handlers would make them compete and drop
// each other's keys. That made `routingKey` and `queue` the same value in all 39 handlers, spelled
// twice, alongside the same `exchange`: five lines of literal per handler and 39 chances to bind a
// queue under the wrong key. Naming the pattern once makes the mismatch unspellable.
export const rpcSub = (pattern: RpcKey) => ({
  exchange: RPC_EXCHANGE,
  routingKey: pattern,
  queue: pattern,
});

// Each event handler binds its own queue + DLX to the topic exchange, so a new subscriber
// (e.g. Notifications) can bind the same routing key without stealing another service's messages.
//
// Both arguments are closed sets rather than `string`: a routing key that no event publishes, or a
// queue name spelled a second way, would otherwise bind a queue that silently receives nothing.
// The handler's own parameter is annotated `EventEnvelope<K>` at the call site — golevelup passes
// the decoded message positionally, so no decorator can relate the two for us.
export const eventSub = (routingKey: EventKey, queue: EventQueue) => ({
  exchange: EVENTS_EXCHANGE,
  routingKey,
  queue,
  queueOptions: { deadLetterExchange: `${queue}.dlx` },
});

// A failed handler dead-letters (no requeue) rather than looping forever; consumers are
// idempotent (processed_messages) so at-least-once redelivery on the happy path is safe.
export async function nackOnError(handler: () => Promise<unknown>): Promise<Nack | undefined> {
  try {
    await handler();
  } catch {
    return new Nack(false);
  }
}
