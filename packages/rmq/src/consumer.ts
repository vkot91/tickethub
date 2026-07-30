import { Nack } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_EXCHANGE } from '@tickethub/contracts';
import type { EventKey, EventQueue } from '@tickethub/contracts';

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
